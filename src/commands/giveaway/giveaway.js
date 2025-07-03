const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const Giveaway = require('../../models/Giveaway');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('抽獎')
        .setDescription('抽獎相關指令')
        .addSubcommand(subcommand =>
            subcommand
                .setName('發起')
                .setDescription('發起一個新抽獎')
                .addStringOption(option =>
                    option.setName('獎品')
                        .setDescription('抽獎的獎品')
                        .setRequired(true))
                .addIntegerOption(option =>
                    option.setName('得獎人數')
                        .setDescription('抽出的得獎人數')
                        .setMinValue(1)
                        .setMaxValue(10)
                        .setRequired(true))
                .addStringOption(option =>
                    option.setName('結束時間')
                        .setDescription('結束時間（格式：YYYY-MM-DD HH:mm）')
                        .setRequired(true))
                .addStringOption(option =>
                    option.setName('說明')
                        .setDescription(`抽獎的詳細說明，\\n 表示換行`)
                        .setRequired(false))
                .addRoleOption(option =>
                    option.setName('限制身分組')
                        .setDescription('限制哪些身分組可以參加')
                        .setRequired(false))
                .addRoleOption(option =>
                    option.setName('提及身分組')
                        .setDescription('要提及的身分組')
                        .setRequired(false))),

    async execute(interaction) {
        if (interaction.options.getSubcommand() === '發起') {
            try {
                const prize = interaction.options.getString('獎品');
                const description = interaction.options.getString('說明');
                const winnersCount = interaction.options.getInteger('得獎人數');
                const endTimeStr = interaction.options.getString('結束時間');
                const restrictRole = interaction.options.getRole('限制身分組');
                const mentionRole = interaction.options.getRole('提及身分組');

                let endTime;
                try {
                    const standardizedTimeStr = endTimeStr.replace(/\//g, '-');
                    if (!standardizedTimeStr.match(/^\d{4}-\d{2}-\d{2} \d{1,2}:\d{2}$/)) {
                        throw new Error('格式錯誤');
                    }
                    const [datePart, timePart] = standardizedTimeStr.split(' ');
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
                } catch (error) {
                    return await interaction.reply({
                        content: '❌ 無效的時間格式！請使用以下格式：\nYYYY-MM-DD HH:mm 或 YYYY/MM/DD HH:mm\n例如：2024-03-01 14:30 或 2024/03/01 14:30\n（使用台北時間）',
                        ephemeral: true
                    });
                }

                const embed = new EmbedBuilder()
                    .setColor('#FFD700')
                    .setTitle(`🎉 抽獎：${prize}`)
                    .setDescription(description ? description.replace(/\\n/g, '\n') : '')
                    .addFields(
                        { name: '🏆 得獎人數', value: `${winnersCount} 人`, inline: true },
                        { 
                            name: '結束時間', 
                            value: `<t:${Math.floor(endTime.getTime() / 1000)}:F>\n倒數：<t:${Math.floor(endTime.getTime() / 1000)}:R>`, 
                            inline: false 
                        }
                    )
                    .setFooter({
                        text: `由 ${interaction.user.tag} 發起`,
                        iconURL: interaction.user.displayAvatarURL()
                    });

                if (restrictRole) {
                    embed.addFields({ name: '參加限制', value: restrictRole.toString(), inline: true });
                }

                const joinButton = new ButtonBuilder()
                    .setCustomId(`giveaway_join_${interaction.id}`)
                    .setLabel('參加抽獎')
                    .setStyle(ButtonStyle.Primary)
                    .setEmoji('🎉');

                const participantsButton = new ButtonBuilder()
                    .setCustomId(`giveaway_participants_${interaction.id}`)
                    .setLabel('0 人參加')
                    .setStyle(ButtonStyle.Secondary)
                    .setEmoji('👥');

                const row = new ActionRowBuilder()
                    .addComponents(joinButton, participantsButton);

                let content = '';
                if (mentionRole) {
                    content = mentionRole.toString();
                }

                const message = await interaction.reply({
                    content: content || null,
                    embeds: [embed],
                    components: [row],
                    fetchReply: true,
                    allowedMentions: { roles: [mentionRole?.id] }
                });

                const giveawayData = {
                    id: interaction.id,
                    prize: prize,
                    description: description,
                    winners_count: winnersCount,
                    channel_id: interaction.channelId,
                    message_id: message.id,
                    guild_id: interaction.guildId,
                    host_id: interaction.user.id,
                    role_requirement: restrictRole?.id,
                    participants: [],
                    created_at: Date.now(),
                    end_time: endTime.getTime(),
                    is_ended: 0
                };

                await Giveaway.create(giveawayData);

            } catch (error) {
                console.error('建立抽獎時發生錯誤：', error);
                await interaction.reply({
                    content: '❌ 建立抽獎時發生錯誤！',
                    ephemeral: true
                });
            }
        }
    }
}; 