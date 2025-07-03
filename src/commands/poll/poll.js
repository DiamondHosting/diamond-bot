const { 
    SlashCommandBuilder, 
    EmbedBuilder, 
    ActionRowBuilder, 
    ButtonBuilder, 
    ButtonStyle,
    PermissionFlagsBits
} = require('discord.js');
const Poll = require('../../models/Poll');
const cron = require('node-cron');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('投票')
        .setDescription('投票相關指令')
        .addSubcommand(subcommand =>
            subcommand
                .setName('發起')
                .setDescription('發起一個新投票')
                .addStringOption(option =>
                    option.setName('問題')
                        .setDescription('投票的問題')
                        .setRequired(true))
                .addStringOption(option =>
                    option.setName('選項')
                        .setDescription('選項清單，用逗號分隔')
                        .setRequired(true))
                .addStringOption(option =>
                    option.setName('結束時間')
                        .setDescription('結束時間，格式：YYYY-MM-DD HH:mm')
                        .setRequired(false))
                .addStringOption(option =>
                    option.setName('說明')
                        .setDescription('投票的詳細說明')
                        .setRequired(false))
                .addIntegerOption(option =>
                    option.setName('多選數量')
                        .setDescription('每人可選擇的選項數量')
                        .setMinValue(1)
                        .setMaxValue(5)
                        .setRequired(false))
                .addAttachmentOption(option =>
                    option.setName('封面圖')
                        .setDescription('投票的封面圖片')
                        .setRequired(false))
                .addRoleOption(option =>
                    option.setName('限制身分組')
                        .setDescription('限制參與投票的身分組')
                        .setRequired(false))
                .addRoleOption(option =>
                    option.setName('提及身分組')
                        .setDescription('要提及的身分組')
                        .setRequired(false))
                .addBooleanOption(option =>
                    option.setName('公開結果')
                        .setDescription('是否公開投票結果')
                        .setRequired(false)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('列表')
                .setDescription('查看進行中的投票')),

    async execute(interaction) {
        const subcommand = interaction.options.getSubcommand();

        if (subcommand === '發起') {
            try {
                const question = interaction.options.getString('問題', true);
                const description = interaction.options.getString('說明');
                const optionsString = interaction.options.getString('選項', true);
                const coverImageAttachment = interaction.options.getAttachment('封面圖');
                const restrictRole = interaction.options.getRole('限制身分組');
                const mentionRole = interaction.options.getRole('提及身分組');
                const isPublic = interaction.options.getBoolean('公開結果') ?? true;
                const maxChoices = interaction.options.getInteger('多選數量') ?? 1;
                const endTimeStr = interaction.options.getString('結束時間');

                if (!question || question.trim().length === 0) {
                    return await interaction.reply({
                        content: '❌ 請輸入有效的問題！',
                        ephemeral: true
                    });
                }
                
                if (!optionsString || optionsString.trim().length === 0) {
                    return await interaction.reply({
                        content: '❌ 請輸入有效的選項！格式：選項1,選項2,選項3',
                        ephemeral: true
                    });
                }

                const options = optionsString.split(',')
                    .map(opt => opt.trim())
                    .filter(opt => opt.length > 0);
                
                if (options.length < 2 || options.length > 5) {
                    return await interaction.reply({
                        content: '❌ 請提供2到5個選項！',
                        ephemeral: true
                    });
                }

                let endTime;
                
                if (endTimeStr) {
                    try {
                        if (!endTimeStr.match(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/)) {
                            throw new Error('格式錯誤');
                        }

                        const [datePart, timePart] = endTimeStr.split(' ');
                        const [year, month, day] = datePart.split('-').map(Number);
                        const [hour, minute] = timePart.split(':').map(Number);

                        endTime = new Date();
                        const taipeiOffset = 8 * 60;
                        const localOffset = endTime.getTimezoneOffset();
                        const totalOffset = taipeiOffset + localOffset;

                        endTime.setFullYear(year);
                        endTime.setMonth(month - 1);
                        endTime.setDate(day);
                        endTime.setHours(hour);
                        endTime.setMinutes(minute - totalOffset);
                        endTime.setSeconds(0);
                        endTime.setMilliseconds(0);

                        if (isNaN(endTime.getTime())) {
                            throw new Error('無效的時間');
                        }

                        const now = new Date();
                        if (endTime.getTime() <= now.getTime()) {
                            return await interaction.reply({
                                content: '❌ 結束時間必須在未來！',
                                ephemeral: true
                            });
                        }

                        const maxEndTime = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
                        if (endTime.getTime() > maxEndTime.getTime()) {
                            return await interaction.reply({
                                content: '❌ 結束時間不能超過30天！',
                                ephemeral: true
                            });
                        }
                    } catch (error) {
                        return await interaction.reply({
                            content: '❌ 無效的時間格式！請使用格式：YYYY-MM-DD HH:mm\n例如：2024-03-01 14:30\n（使用台北時間）',
                            ephemeral: true
                        });
                    }
                }

                if (coverImageAttachment) {
                    if (!coverImageAttachment.contentType?.startsWith('image/')) {
                        return await interaction.reply({
                            content: '❌ 封面圖必須是圖片格式！',
                            ephemeral: true
                        });
                    }

                    if (coverImageAttachment.size > 8 * 1024 * 1024) {
                        return await interaction.reply({
                            content: '❌ 封面圖檔案大小超過 8MB！',
                            ephemeral: true
                        });
                    }
                }

                const embed = new EmbedBuilder()
                    .setColor('#FFD700')
                    .setAuthor({ 
                        name: `發起者：${interaction.user.tag}`,
                        iconURL: interaction.user.displayAvatarURL()
                    })
                    .setTitle(`📊 ${question}`);

                let descriptionText = '';
                if (description) {
                    const formattedDescription = description.replace(/\\n/g, '\n');
                    descriptionText += `📝 說明：\n${formattedDescription}\n`;
                }

                if (restrictRole) {
                    descriptionText += `🔒 限制投票身分組\n${restrictRole.toString()}\n`;
                }

                descriptionText += '⚙️ 投票設置';
                descriptionText += `\n🔢 投票類型：最多選擇 ${maxChoices} 項`;
                descriptionText += `\n👁️ 結果公開：${isPublic ? '是' : '否'}`;

                if (endTime) {
                    const endTimeUnix = Math.floor(endTime.getTime() / 1000);
                    descriptionText += `\n⏰ 結束時間\n<t:${endTimeUnix}:F> (<t:${endTimeUnix}:R>)`;
                } else {
                    descriptionText += '\n⏰ 結束時間：尚未設定';
                }

                embed.setDescription(descriptionText);

                if (coverImageAttachment) {
                    embed.setImage(coverImageAttachment.url);
                }

                const now = new Date();
                const formattedTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

                embed.setFooter({ 
                    text: `由 ${interaction.user.tag} 發起 | ${formattedTime}`,
                    iconURL: interaction.user.displayAvatarURL()
                });

                const rows = [];
                for (let i = 0; i < options.length; i += 3) {
                    const row = new ActionRowBuilder()
                        .addComponents(
                            options.slice(i, i + 3).map((opt, index) => 
                                new ButtonBuilder()
                                    .setCustomId(`vote_${i + index}`)
                                    .setLabel(opt)
                                    .setStyle(ButtonStyle.Primary)
                            )
                        );
                    rows.push(row);
                }

                const managementRow = new ActionRowBuilder()
                    .addComponents(
                        new ButtonBuilder()
                            .setCustomId('show_voters')
                            .setLabel('查看投票者')
                            .setStyle(ButtonStyle.Secondary)
                            .setEmoji('👥'),
                        new ButtonBuilder()
                            .setCustomId('show_results')
                            .setLabel('查看結果')
                            .setStyle(ButtonStyle.Success)
                            .setEmoji('📊'),
                        new ButtonBuilder()
                            .setCustomId('end_poll')
                            .setLabel('結束投票')
                            .setStyle(ButtonStyle.Danger)
                            .setEmoji('🛑')
                    );
                rows.push(managementRow);

                let content = '';
                if (mentionRole) {
                    content = mentionRole.toString();
                }

                const response = await interaction.reply({
                    content: content || null,
                    embeds: [embed],
                    components: rows,
                    fetchReply: true,
                    allowedMentions: { roles: [mentionRole?.id] }
                });

                const pollData = {
                    id: interaction.id,
                    question: question,
                    description: description,
                    options: options,
                    votes: {},
                    channel_id: interaction.channelId,
                    guild_id: interaction.guildId,
                    message_id: response.id,
                    created_at: Date.now(),
                    end_time: endTime ? endTime.getTime() : null,
                    is_ended: 0,
                    host_id: interaction.user.id,
                    is_public: isPublic,
                    max_choices: maxChoices,
                    restrict_role: restrictRole?.id,
                    cover_image: coverImageAttachment?.url || null
                };

                const poll = await Poll.create(pollData);

                if (endTime) {
                    const cronTime = `${endTime.getMinutes()} ${endTime.getHours()} ${endTime.getDate()} ${endTime.getMonth() + 1} *`;
                    cron.schedule(cronTime, async () => {
                        try {
                            await endPoll(poll.id, interaction);
                        } catch (error) {
                            console.error('結束投票時發生錯誤：', error);
                        }
                    }, {
                        timezone: "Asia/Taipei"
                    });
                }

            } catch (error) {
                console.error('建立投票時發生錯誤：', error);
                console.error('錯誤堆疊：', error.stack);
                
                let errorMessage = '❌ 建立投票時發生錯誤！\n';
                
                if (error.code) {
                    errorMessage += `錯誤代碼：${error.code}\n`;
                }
                if (error.message) {
                    errorMessage += `錯誤訊息：${error.message}\n`;
                }
                
                if (error.code === 'SQLITE_ERROR') {
                    errorMessage += '資料庫操作失敗，請聯繫管理員。\n';
                }
                
                if (error.httpStatus) {
                    errorMessage += `Discord API 錯誤：${error.httpStatus}\n`;
                }

                await interaction.reply({
                    content: errorMessage,
                    ephemeral: true
                }).catch(replyError => {
                    console.error('回覆錯誤訊息時發生錯誤：', replyError);
                    if (interaction.replied) {
                        interaction.followUp({
                            content: errorMessage,
                            ephemeral: true
                        }).catch(console.error);
                    }
                });
            }
        } else if (subcommand === '列表') {
            try {
                const activePolls = await Poll.findActive(interaction.guildId);

                if (activePolls.length === 0) {
                    return await interaction.reply({
                        content: '目前沒有進行中的投票！',
                        ephemeral: true
                    });
                }

                const embed = new EmbedBuilder()
                    .setColor('#FFD700')
                    .setTitle('📊 進行中的投票')
                    .setDescription(
                        activePolls.map(poll => {
                            const endTime = Math.floor(poll.end_time / 1000);
                            const totalVotes = Object.keys(poll.votes).length;
                            return `**${poll.question}**\n` +
                                   `投票人數：${totalVotes} 人\n` +
                                   `結束時間：<t:${endTime}:F> (<t:${endTime}:R>)\n` +
                                   `[點擊前往](https://discord.com/channels/${poll.guild_id}/${poll.channel_id}/${poll.message_id})\n`;
                        }).join('\n')
                    )
                    .setFooter({ 
                        text: `共 ${activePolls.length} 個進行中的投票`, 
                        iconURL: interaction.guild.iconURL() 
                    })
                    .setTimestamp();

                await interaction.reply({
                    embeds: [embed],
                    ephemeral: true
                });

            } catch (error) {
                console.error('查詢投票列表時發生錯誤：', error);
                console.error(error.stack);
                await interaction.reply({
                    content: '❌ 查詢投票列表時發生錯誤！',
                    ephemeral: true
                });
            }
        }
    }
};

async function endPoll(pollId, interaction) {
    const pollData = await Poll.findById(pollId);
    if (!pollData || pollData.is_ended) return;

    const results = Object.entries(pollData.votes).reduce((acc, [userId, optionIndex]) => {
        acc[optionIndex] = (acc[optionIndex] || 0) + 1;
        return acc;
    }, {});

    const optionButtons = pollData.options.map((opt, i) => 
        new ButtonBuilder()
            .setCustomId(`vote_${i}`)
            .setLabel(opt)
            .setStyle(ButtonStyle.Primary)
            .setDisabled(true)
    );

    const showVotersButton = new ButtonBuilder()
        .setCustomId('show_voters')
        .setLabel('查看投票者')
        .setStyle(ButtonStyle.Secondary)
        .setEmoji('👥');

    const showResultsButton = new ButtonBuilder()
        .setCustomId('show_results')
        .setLabel('查看結果')
        .setStyle(ButtonStyle.Success)
        .setEmoji('📊');

    const endPollButton = new ButtonBuilder()
        .setCustomId('end_poll')
        .setLabel('已結束')
        .setStyle(ButtonStyle.Danger)
        .setEmoji('🛑')
        .setDisabled(true);

    const rows = [];
    for (let i = 0; i < optionButtons.length; i += 3) {
        const row = new ActionRowBuilder()
            .addComponents(optionButtons.slice(i, i + 3));
        rows.push(row);
    }
    const managementRow = new ActionRowBuilder()
        .addComponents(showVotersButton, showResultsButton, endPollButton);
    rows.push(managementRow);

    const channel = await interaction.client.channels.fetch(pollData.channel_id);
    if (channel) {
        const message = await channel.messages.fetch(pollData.message_id);
        if (message) {
            await message.edit({
                embeds: [message.embeds[0]],
                components: rows
            });
        }
    }

    pollData.is_ended = 1;
    await pollData.save();
} 