import { db } from '../utils/database.js';
import { EmbedBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder, Colors } from 'discord.js';
import Poll from '../models/Poll.js';
import cron from 'node-cron';

// 存儲定時任務的 Map
const scheduledTasks = new Map();

export default {
    name: 'interactionCreate',
    async execute(interaction) {
        // 設定客戶端引用
        if (!this.client) {
            this.client = interaction.client;
        }

        // 設定定期檢查任務（每分鐘檢查一次）
        if (!this.checkInterval) {
            this.checkInterval = setInterval(async () => {
                try {
                    await checkExpiredPolls(interaction.client);
                    await checkExpiredGiveaways(interaction.client);
                } catch (error) {
                    console.error('❌ 檢查過期項目時發生錯誤：', error.message);
                }
            }, 60000);
        }

        // 處理按鈕互動
        if (interaction.isButton()) {
            await handleButtonInteraction(interaction);
        } 
        // 處理斜線指令
        else if (interaction.isChatInputCommand()) {
            await handleSlashCommand(interaction);
        }
        // 處理選單互動
        else if (interaction.isStringSelectMenu()) {
            await handleSelectMenu(interaction);
        }
    },
};

// 處理按鈕互動
async function handleButtonInteraction(interaction) {
    const customId = interaction.customId;

    if (customId.startsWith('vote_')) {
        await handleVoteButton(interaction);
    } else if (customId === 'show_voters' || customId === 'show_results') {
        await handlePollInfoButton(interaction);
    } else if (customId.startsWith('giveaway_')) {
        await handleGiveawayButton(interaction);
    } else {
        await interaction.reply({
            content: '❌ 未知的按鈕互動！',
            ephemeral: true
        });
    }
}

// 處理投票按鈕
async function handleVoteButton(interaction) {
    try {
        const pollId = interaction.message.id;
        const optionIndex = parseInt(interaction.customId.replace('vote_', ''));
        
        const poll = await Poll.findById(pollId);
        if (!poll) {
            return await interaction.reply({
                content: '❌ 找不到此投票！',
                ephemeral: true
            });
        }

        if (poll.is_ended) {
            return await interaction.reply({
                content: '❌ 此投票已結束！',
                ephemeral: true
            });
        }

        // 檢查時間限制
        if (poll.end_time && Date.now() > poll.end_time) {
            await endPoll(pollId, interaction);
            return await interaction.reply({
                content: '❌ 此投票已過期！',
                ephemeral: true
            });
        }

        // 檢查權限限制
        if (poll.restrict_role) {
            const member = await interaction.guild.members.fetch(interaction.user.id);
            if (!member.roles.cache.has(poll.restrict_role)) {
                return await interaction.reply({
                    content: '❌ 你沒有參與此投票的權限！',
                    ephemeral: true
                });
            }
        }

        // 處理投票邏輯
        const userId = interaction.user.id;
        const userVotes = poll.votes[userId] || [];
        
        if (userVotes.includes(optionIndex)) {
            // 取消投票
            poll.votes[userId] = userVotes.filter(vote => vote !== optionIndex);
            if (poll.votes[userId].length === 0) {
                delete poll.votes[userId];
            }
        } else {
            // 新增投票
            if (userVotes.length >= poll.max_choices) {
                return await interaction.reply({
                    content: `❌ 你最多只能選擇 ${poll.max_choices} 個選項！`,
                    ephemeral: true
                });
            }
            poll.votes[userId] = [...userVotes, optionIndex];
        }

        await poll.save();
        await updatePollMessage(interaction, poll);
        
        await interaction.reply({
            content: '✅ 投票已更新！',
            ephemeral: true
        });

    } catch (error) {
        console.error('❌ 處理投票時發生錯誤：', error);
        await interaction.reply({
            content: '❌ 處理投票時發生錯誤！',
            ephemeral: true
        });
    }
}

// 處理抽獎按鈕
async function handleGiveawayButton(interaction) {
    try {
        const customId = interaction.customId;
        
        if (customId.startsWith('giveaway_join_')) {
            const giveawayId = customId.replace('giveaway_join_', '');
            // 處理參加抽獎邏輯
            await handleJoinGiveaway(interaction, giveawayId);
        } else if (customId.startsWith('giveaway_participants_')) {
            const giveawayId = customId.replace('giveaway_participants_', '');
            // 顯示參與者清單
            await showGiveawayParticipants(interaction, giveawayId);
        }
    } catch (error) {
        console.error('❌ 處理抽獎按鈕時發生錯誤：', error);
        await interaction.reply({
            content: '❌ 處理抽獎時發生錯誤！',
            ephemeral: true
        });
    }
}

// 處理斜線指令
async function handleSlashCommand(interaction) {
    const command = interaction.client.commands.get(interaction.commandName);

    if (!command) {
        console.error(`❌ 找不到指令：${interaction.commandName}`);
        return;
    }

    try {
        await command.execute(interaction);
    } catch (error) {
        console.error(`❌ 執行指令 ${interaction.commandName} 時發生錯誤：`, error);
        
        const errorMessage = {
            content: '❌ 執行指令時發生錯誤！',
            ephemeral: true
        };

        if (interaction.replied || interaction.deferred) {
            await interaction.followUp(errorMessage);
        } else {
            await interaction.reply(errorMessage);
        }
    }
}

// 檢查過期的投票並結束
async function checkExpiredPolls(client) {
    const now = Date.now();
    const endedPolls = await Poll.find({ 
        is_ended: false, 
        end_time: { $lte: now } 
    });

    for (const poll of endedPolls) {
        try {
            await endPoll(poll.id, { client });
        } catch (error) {
            console.error(`結束投票 ${poll.id} 時發生錯誤：`, error);
        }
    }
}

// 檢查過期的抽獎並結束
async function checkExpiredGiveaways(client) {
    const now = Date.now();
    const endedGiveaways = db.prepare(`
        SELECT * FROM giveaways 
        WHERE is_ended = 0 AND end_time <= ?
    `).all(now);

    for (const giveaway of endedGiveaways) {
        try {
            await endGiveaway(giveaway.id, client);
        } catch (error) {
            console.error('結束抽獎時發生錯誤：', error);
        }
    }
}

function createProgressBar(percentage) {
    const filledBlocks = Math.round(percentage / 10);
    const emptyBlocks = 10 - filledBlocks;
    return '█'.repeat(filledBlocks) + '░'.repeat(emptyBlocks);
}

async function endPoll(pollId, interaction) {
    const poll = await Poll.findById(pollId);
    if (!poll || poll.is_ended) return;

    const optionButtons = poll.options.map((opt, i) => 
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

    const channel = await interaction.client.channels.fetch(poll.channel_id);
    if (channel) {
        const message = await channel.messages.fetch(poll.message_id);
        if (message) {
            await message.edit({
                embeds: [message.embeds[0]],
                components: rows
            });
        }
    }

    poll.is_ended = 1;
    await poll.save();
}

async function endGiveaway(giveawayId, client) {
    try {
        const giveaway = db.prepare('SELECT * FROM giveaways WHERE id = ?').get(giveawayId);
        if (!giveaway || giveaway.is_ended) return;

        const participants = db.prepare(`
            SELECT user_id FROM giveaway_participants 
            WHERE giveaway_id = ?
        `).all(giveawayId);

        if (participants.length === 0) {
            try {
                const channel = await client.channels.fetch(giveaway.channel_id);
                if (channel) {
                    try {
                        const message = await channel.messages.fetch(giveaway.message_id);
                        if (message) {
                            const row = new ActionRowBuilder()
                                .addComponents(
                                    ButtonBuilder.from(message.components[0].components[0]).setDisabled(true),
                                    ButtonBuilder.from(message.components[0].components[1])
                                );

                            await message.edit({ components: [row] });
                            await channel.send('抽獎結束，但沒有人參加！');
                        }
                    } catch (messageError) {
                        console.error('無法找到或編輯訊息：', messageError);
                        await channel.send('抽獎結束，但沒有人參加！');
                    }
                }
            } catch (channelError) {
                console.error('無法找到頻道：', channelError);
            }
            return;
        }

        const winners = [];
        const participantIds = participants.map(p => p.user_id);
        for (let i = 0; i < Math.min(giveaway.winners_count, participants.length); i++) {
            const winnerIndex = Math.floor(Math.random() * participantIds.length);
            winners.push(participantIds[winnerIndex]);
            participantIds.splice(winnerIndex, 1);
        }

        db.prepare(`
            UPDATE giveaways 
            SET is_ended = 1 
            WHERE id = ?
        `).run(giveawayId);

        try {
            const channel = await client.channels.fetch(giveaway.channel_id);
            if (channel) {
                try {
                    const message = await channel.messages.fetch(giveaway.message_id);
                    if (message) {
                        const row = new ActionRowBuilder()
                            .addComponents(
                                ButtonBuilder.from(message.components[0].components[0]).setDisabled(true),
                                ButtonBuilder.from(message.components[0].components[1])
                            );

                        await message.edit({ components: [row] });
                    }
                } catch (messageError) {
                    console.error('無法找到或編輯原始訊息：', messageError);
                }

                const winnerEmbed = new EmbedBuilder()
                    .setColor('#FFD700')
                    .setTitle('🎉 抽獎結果')
                    .setDescription(`**獎品：${giveaway.prize}**`)
                    .addFields(
                        { name: '🏆 得獎者', value: winners.map(id => `<@${id}>`).join('\n'), inline: false }
                    )
                    .setFooter({ 
                        text: '請管理員確認得獎者是否已領取獎品',
                        iconURL: client.user.displayAvatarURL()
                    })
                    .setTimestamp();

                const adminRow = new ActionRowBuilder()
                    .addComponents(
                        new ButtonBuilder()
                            .setCustomId(`giveaway_claimed_${giveawayId}`)
                            .setLabel('已領取獎品')
                            .setStyle(ButtonStyle.Success)
                            .setEmoji('✅'),
                        new ButtonBuilder()
                            .setCustomId(`giveaway_reroll_${giveawayId}`)
                            .setLabel('重新抽獎')
                            .setStyle(ButtonStyle.Danger)
                            .setEmoji('🎲')
                    );

                await channel.send({
                    content: `恭喜 ${winners.map(id => `<@${id}>`).join('、')} 獲得 **${giveaway.prize}**！`,
                    embeds: [winnerEmbed],
                    components: [adminRow],
                    allowedMentions: { users: winners }
                });
            }
        } catch (channelError) {
            console.error('無法找到頻道：', channelError);
        }
    } catch (error) {
        console.error('結束抽獎時發生錯誤：', error);
    }
}