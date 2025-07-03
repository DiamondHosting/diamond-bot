import { db } from '../utils/database.js';
import { EmbedBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder, Colors } from 'discord.js';
import Poll from '../models/Poll.js';
import Giveaway from '../models/Giveaway.js';
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
    } else if (customId === 'end_poll') {
        await handleEndPollButton(interaction);
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
        
        const poll = await Poll.findOne({ message_id: pollId });
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
            await endPoll(poll.message_id, interaction);
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
        const userVotes = poll.votes.get(userId) || [];
        
        if (userVotes.includes(optionIndex)) {
            // 取消投票
            const newVotes = userVotes.filter(vote => vote !== optionIndex);
            if (newVotes.length === 0) {
                poll.votes.delete(userId);
            } else {
                poll.votes.set(userId, newVotes);
            }
        } else {
            // 新增投票
            if (userVotes.length >= poll.max_choices) {
                return await interaction.reply({
                    content: `❌ 你最多只能選擇 ${poll.max_choices} 個選項！`,
                    ephemeral: true
                });
            }
            poll.votes.set(userId, [...userVotes, optionIndex]);
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
            await handleJoinGiveaway(interaction, giveawayId);
        } else if (customId.startsWith('giveaway_participants_')) {
            const giveawayId = customId.replace('giveaway_participants_', '');
            await showGiveawayParticipants(interaction, giveawayId);
        } else if (customId.startsWith('giveaway_claimed_')) {
            const giveawayId = customId.replace('giveaway_claimed_', '');
            await handleGiveawayClaimed(interaction, giveawayId);
        } else if (customId.startsWith('giveaway_reroll_')) {
            const giveawayId = customId.replace('giveaway_reroll_', '');
            await handleGiveawayReroll(interaction, giveawayId);
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
    const endedGiveaways = await Giveaway.find({ 
        is_ended: false, 
        end_time: { $lte: now } 
    });

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
    const poll = await Poll.findOne({ message_id: pollId });
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

    poll.is_ended = true;
    await poll.save();
}

async function endGiveaway(giveawayId, client) {
    try {
        const giveaway = await Giveaway.findOne({ id: giveawayId });
        if (!giveaway || giveaway.is_ended) return;

        if (giveaway.participants.length === 0) {
            try {
                const channel = await client.channels.fetch(giveaway.channel_id);
                if (channel) {
                    try {
                        const message = await channel.messages.fetch(giveaway.message_id);
                        if (message) {
                            const joinButton = new ButtonBuilder()
                                .setCustomId(`giveaway_join_${giveawayId}`)
                                .setLabel('已結束')
                                .setStyle(ButtonStyle.Danger)
                                .setEmoji('🔒')
                                .setDisabled(true);

                            const participantsButton = new ButtonBuilder()
                                .setCustomId(`giveaway_participants_${giveawayId}`)
                                .setLabel('0 人參加')
                                .setStyle(ButtonStyle.Secondary)
                                .setEmoji('👥');

                            const row = new ActionRowBuilder()
                                .addComponents(joinButton, participantsButton);

                            await message.edit({ components: [row] });
                        }
                    } catch (messageError) {
                        console.error('無法找到或編輯訊息：', messageError.message);
                    }
                    await channel.send('🎉 抽獎結束，但沒有人參加！');
                }
            } catch (channelError) {
                console.error('無法找到頻道：', channelError.message);
            }
            
            giveaway.is_ended = true;
            await giveaway.save();
            return;
        }

        const winners = [];
        const participantIds = [...giveaway.participants.map(p => p.user_id)];
        for (let i = 0; i < Math.min(giveaway.winners_count, participantIds.length); i++) {
            const winnerIndex = Math.floor(Math.random() * participantIds.length);
            winners.push(participantIds[winnerIndex]);
            participantIds.splice(winnerIndex, 1);
        }

        giveaway.is_ended = true;
        await giveaway.save();

        try {
            const channel = await client.channels.fetch(giveaway.channel_id);
            if (channel) {
                try {
                    const message = await channel.messages.fetch(giveaway.message_id);
                    if (message) {
                        const joinButton = new ButtonBuilder()
                            .setCustomId(`giveaway_join_${giveawayId}`)
                            .setLabel('已結束')
                            .setStyle(ButtonStyle.Danger)
                            .setEmoji('🔒')
                            .setDisabled(true);

                        const participantsButton = new ButtonBuilder()
                            .setCustomId(`giveaway_participants_${giveawayId}`)
                            .setLabel(`${giveaway.participants.length} 人參加`)
                            .setStyle(ButtonStyle.Secondary)
                            .setEmoji('👥');

                        const row = new ActionRowBuilder()
                            .addComponents(joinButton, participantsButton);

                        await message.edit({ components: [row] });
                    }
                } catch (messageError) {
                    console.error('無法找到或編輯原始訊息：', messageError.message);
                }

                const winnerEmbed = new EmbedBuilder()
                    .setColor('#FFD700')
                    .setTitle('🎉 抽獎結果')
                    .setDescription(`**獎品：${giveaway.prize}**`)
                    .addFields(
                        { name: '🏆 得獎者', value: winners.map(id => `<@${id}>`).join('\n'), inline: false }
                    )
                    .setFooter({ 
                        text: '只有發起者可以操作下方按鈕',
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
                    content: `🎉 恭喜 ${winners.map(id => `<@${id}>`).join('、')} 獲得 **${giveaway.prize}**！`,
                    embeds: [winnerEmbed],
                    components: [adminRow],
                    allowedMentions: { users: winners }
                });
            }
        } catch (channelError) {
            console.error('無法找到頻道：', channelError.message);
        }
    } catch (error) {
        console.error('結束抽獎時發生錯誤：', error.message);
    }
}

// 處理投票信息按鈕
async function handlePollInfoButton(interaction) {
    try {
        const pollId = interaction.message.id;
        const poll = await Poll.findOne({ message_id: pollId });
        
        if (!poll) {
            return await interaction.reply({
                content: '❌ 找不到此投票！',
                ephemeral: true
            });
        }

        const customId = interaction.customId;
        
        if (customId === 'show_voters') {
            await showVoters(interaction, poll);
        } else if (customId === 'show_results') {
            await showResults(interaction, poll);
        }
    } catch (error) {
        console.error('❌ 處理投票信息時發生錯誤：', error);
        await interaction.reply({
            content: '❌ 處理投票信息時發生錯誤！',
            ephemeral: true
        });
    }
}

// 顯示投票者
async function showVoters(interaction, poll) {
    const voterList = Array.from(poll.votes.entries()).map(([userId, votes]) => {
        const optionNames = votes.map(i => poll.options[i]).join(', ');
        return `<@${userId}>: ${optionNames}`;
    });

    const embed = new EmbedBuilder()
        .setColor('#0099ff')
        .setTitle('👥 投票者清單')
        .setDescription(voterList.length > 0 ? voterList.join('\n') : '目前還沒有人投票')
        .setFooter({ text: `總共 ${voterList.length} 人投票` });

    await interaction.reply({
        embeds: [embed],
        ephemeral: true
    });
}

// 顯示投票結果
async function showResults(interaction, poll) {
    const totalVotes = Array.from(poll.votes.values()).flat().length;
    const optionCounts = poll.options.map((option, index) => {
        const count = Array.from(poll.votes.values()).flat().filter(vote => vote === index).length;
        const percentage = totalVotes > 0 ? ((count / totalVotes) * 100).toFixed(1) : 0;
        return { option, count, percentage };
    });

    const resultsText = optionCounts.map((item, index) => 
        `**${index + 1}.** ${item.option}\n${createProgressBar(item.percentage)} ${item.count} 票 (${item.percentage}%)`
    ).join('\n\n');

    const embed = new EmbedBuilder()
        .setColor('#00ff00')
        .setTitle('📊 投票結果')
        .setDescription(resultsText)
        .setFooter({ text: `總投票數：${totalVotes}` });

    await interaction.reply({
        embeds: [embed],
        ephemeral: true
    });
}

// 處理結束投票按鈕
async function handleEndPollButton(interaction) {
    try {
        const pollId = interaction.message.id;
        const poll = await Poll.findOne({ message_id: pollId });
        
        if (!poll) {
            return await interaction.reply({
                content: '❌ 找不到此投票！',
                ephemeral: true
            });
        }

        if (poll.is_ended) {
            return await interaction.reply({
                content: '❌ 此投票已經結束了！',
                ephemeral: true
            });
        }

        // 檢查權限 - 只有投票發起者或管理員可以結束投票
        const member = await interaction.guild.members.fetch(interaction.user.id);
        const isHost = poll.host_id === interaction.user.id;
        const isAdmin = member.permissions.has('ManageMessages');

        if (!isHost && !isAdmin) {
            return await interaction.reply({
                content: '❌ 只有投票發起者或管理員可以結束投票！',
                ephemeral: true
            });
        }

        await endPoll(pollId, interaction);
        
        await interaction.reply({
            content: '✅ 投票已成功結束！',
            ephemeral: true
        });

    } catch (error) {
        console.error('❌ 結束投票時發生錯誤：', error);
        await interaction.reply({
            content: '❌ 結束投票時發生錯誤！',
            ephemeral: true
        });
    }
}

// 處理參加抽獎
async function handleJoinGiveaway(interaction, giveawayId) {
    try {
        const giveaway = await Giveaway.findOne({ id: giveawayId });
        
        if (!giveaway) {
            return await interaction.reply({
                content: '❌ 找不到此抽獎！',
                ephemeral: true
            });
        }

        if (giveaway.is_ended) {
            return await interaction.reply({
                content: '❌ 此抽獎已結束，無法參加或退出！',
                ephemeral: true
            });
        }

        // 檢查是否已經參加
        const existingIndex = giveaway.participants.findIndex(p => p.user_id === interaction.user.id);

        if (existingIndex !== -1) {
            // 取消參加
            giveaway.participants.splice(existingIndex, 1);
            await giveaway.save();

            await interaction.reply({
                content: '❌ 你已取消參加此抽獎！',
                ephemeral: true
            });
        } else {
            // 參加抽獎
            giveaway.participants.push({
                user_id: interaction.user.id,
                joined_at: Date.now()
            });
            await giveaway.save();

            await interaction.reply({
                content: '✅ 你已成功參加此抽獎！',
                ephemeral: true
            });
        }

        // 更新抽獎訊息的參與人數
        await updateGiveawayMessage(interaction, giveaway);

    } catch (error) {
        console.error('❌ 處理參加抽獎時發生錯誤：', error);
        await interaction.reply({
            content: '❌ 處理參加抽獎時發生錯誤！',
            ephemeral: true
        });
    }
}

// 顯示抽獎參與者
async function showGiveawayParticipants(interaction, giveawayId) {
    try {
        const giveaway = await Giveaway.findOne({ id: giveawayId });
        
        if (!giveaway) {
            return await interaction.reply({
                content: '❌ 找不到此抽獎！',
                ephemeral: true
            });
        }

        // 按參加時間排序（先參加的在上面）
        const sortedParticipants = giveaway.participants.sort((a, b) => a.joined_at - b.joined_at);
        
        let description = '';
        if (sortedParticipants.length === 0) {
            description = '目前還沒有人參加';
        } else {
            // 分批處理參與者，避免超過 Discord 限制
            const maxPerPage = 20;
            const participants = sortedParticipants.slice(0, maxPerPage);
            
            for (let i = 0; i < participants.length; i++) {
                const participant = participants[i];
                try {
                    const user = await interaction.client.users.fetch(participant.user_id);
                    const joinTime = new Date(participant.joined_at);
                    const timeString = `${joinTime.getHours().toString().padStart(2, '0')}:${joinTime.getMinutes().toString().padStart(2, '0')}`;
                    description += `${i + 1}. ${user.displayName || user.username} - ${timeString}\n`;
                } catch (error) {
                    description += `${i + 1}. <@${participant.user_id}> - 未知時間\n`;
                }
            }
            
            if (sortedParticipants.length > maxPerPage) {
                description += `\n... 還有 ${sortedParticipants.length - maxPerPage} 人`;
            }
        }

        const embed = new EmbedBuilder()
            .setColor('#ffa500')
            .setTitle('🎉 抽獎參與者')
            .setDescription(description)
            .setFooter({ text: `總共 ${sortedParticipants.length} 人參加 | 按參加順序排列` });

        await interaction.reply({
            embeds: [embed],
            ephemeral: true
        });

    } catch (error) {
        console.error('❌ 顯示參與者時發生錯誤：', error);
        await interaction.reply({
            content: '❌ 顯示參與者時發生錯誤！',
            ephemeral: true
        });
    }
}

// 處理獎品已領取按鈕
async function handleGiveawayClaimed(interaction, giveawayId) {
    try {
        const giveaway = await Giveaway.findOne({ id: giveawayId });
        
        if (!giveaway) {
            return await interaction.reply({
                content: '❌ 找不到此抽獎！',
                ephemeral: true
            });
        }

        // 檢查權限 - 只有發起者可以操作
        if (giveaway.host_id !== interaction.user.id) {
            return await interaction.reply({
                content: '❌ 只有抽獎發起者可以操作此按鈕！',
                ephemeral: true
            });
        }

        // 禁用所有按鈕
        const disabledRow = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId(`giveaway_claimed_${giveawayId}`)
                    .setLabel('已確認領取')
                    .setStyle(ButtonStyle.Success)
                    .setEmoji('✅')
                    .setDisabled(true),
                new ButtonBuilder()
                    .setCustomId(`giveaway_reroll_${givewayId}`)
                    .setLabel('重新抽獎')
                    .setStyle(ButtonStyle.Danger)
                    .setEmoji('🎲')
                    .setDisabled(true)
            );

        await interaction.update({ components: [disabledRow] });
        
        await interaction.followUp({
            content: '✅ 已確認得獎者領取獎品！',
            ephemeral: true
        });

    } catch (error) {
        console.error('❌ 處理已領取按鈕時發生錯誤：', error);
        await interaction.reply({
            content: '❌ 處理操作時發生錯誤！',
            ephemeral: true
        });
    }
}

// 處理重新抽獎按鈕
async function handleGiveawayReroll(interaction, giveawayId) {
    try {
        const giveaway = await Giveaway.findOne({ id: giveawayId });
        
        if (!giveaway) {
            return await interaction.reply({
                content: '❌ 找不到此抽獎！',
                ephemeral: true
            });
        }

        // 檢查權限 - 只有發起者可以操作
        if (giveaway.host_id !== interaction.user.id) {
            return await interaction.reply({
                content: '❌ 只有抽獎發起者可以操作此按鈕！',
                ephemeral: true
            });
        }

        if (giveaway.participants.length === 0) {
            return await interaction.reply({
                content: '❌ 沒有參與者可以重新抽獎！',
                ephemeral: true
            });
        }

        // 重新抽獎
        const winners = [];
        const participantIds = [...giveaway.participants.map(p => p.user_id)];
        for (let i = 0; i < Math.min(giveaway.winners_count, participantIds.length); i++) {
            const winnerIndex = Math.floor(Math.random() * participantIds.length);
            winners.push(participantIds[winnerIndex]);
            participantIds.splice(winnerIndex, 1);
        }

        const newWinnerEmbed = new EmbedBuilder()
            .setColor('#FF6B6B')
            .setTitle('🎲 重新抽獎結果')
            .setDescription(`**獎品：${giveaway.prize}**`)
            .addFields(
                { name: '🏆 新得獎者', value: winners.map(id => `<@${id}>`).join('\n'), inline: false }
            )
            .setFooter({ 
                text: '這是重新抽獎的結果',
                iconURL: interaction.client.user.displayAvatarURL()
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

        await interaction.update({
            embeds: [newWinnerEmbed],
            components: [adminRow]
        });

        await interaction.followUp({
            content: `🎲 重新抽獎完成！新得獎者：${winners.map(id => `<@${id}>`).join('、')}`,
            allowedMentions: { users: winners }
        });

    } catch (error) {
        console.error('❌ 處理重新抽獎時發生錯誤：', error);
        await interaction.reply({
            content: '❌ 重新抽獎時發生錯誤！',
            ephemeral: true
        });
    }
}

// 更新投票訊息
async function updatePollMessage(interaction, poll) {
    try {
        const totalVotes = Array.from(poll.votes.values()).flat().length;
        const optionCounts = poll.options.map((option, index) => {
            const count = Array.from(poll.votes.values()).flat().filter(vote => vote === index).length;
            return { option, count };
        });

        const resultsText = optionCounts.map((item, index) => 
            `**${index + 1}.** ${item.option} - ${item.count} 票`
        ).join('\n');

        const embed = new EmbedBuilder()
            .setColor('#0099ff')
            .setTitle(`📊 ${poll.question}`)
            .setDescription(poll.description || '請選擇你的選項：')
            .addFields({ name: '選項與票數', value: resultsText })
            .setFooter({ 
                text: `總投票數：${totalVotes} | 最多可選：${poll.max_choices} 項`,
                iconURL: interaction.client.user.displayAvatarURL()
            })
            .setTimestamp();

        // 創建按鈕
        const optionButtons = poll.options.map((option, index) => 
            new ButtonBuilder()
                .setCustomId(`vote_${index}`)
                .setLabel(`${index + 1}. ${option}`)
                .setStyle(ButtonStyle.Primary)
                .setDisabled(poll.is_ended)
        );

        const infoButtons = [
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
                .setLabel(poll.is_ended ? '已結束' : '結束投票')
                .setStyle(ButtonStyle.Danger)
                .setEmoji('🛑')
                .setDisabled(poll.is_ended)
        ];

        const rows = [];
        for (let i = 0; i < optionButtons.length; i += 3) {
            const row = new ActionRowBuilder()
                .addComponents(optionButtons.slice(i, i + 3));
            rows.push(row);
        }
        
        const infoRow = new ActionRowBuilder()
            .addComponents(infoButtons);
        rows.push(infoRow);

        await interaction.message.edit({
            embeds: [embed],
            components: rows
        });

    } catch (error) {
        console.error('❌ 更新投票訊息時發生錯誤：', error);
    }
}

// 更新抽獎訊息
async function updateGiveawayMessage(interaction, giveaway) {
    try {
        const timeLeft = giveaway.end_time - Date.now();
        const timeLeftText = timeLeft > 0 ? 
            `<t:${Math.floor(giveaway.end_time / 1000)}:R>` : 
            '已結束';

        const embed = new EmbedBuilder()
            .setColor(giveaway.is_ended ? '#FF0000' : '#FFD700')
            .setTitle(`🎉 抽獎：${giveaway.prize}`)
            .addFields(
                { name: '🏆 得獎人數', value: giveaway.winners_count.toString(), inline: true },
                { name: '👥 參加人數', value: giveaway.participants.length.toString(), inline: true },
                { name: '⏰ 結束時間', value: timeLeftText, inline: true }
            )
            .setFooter({ 
                text: giveaway.is_ended ? '抽獎已結束' : '點擊下方按鈕參加抽獎！',
                iconURL: interaction.client.user.displayAvatarURL()
            })
            .setTimestamp();

        if (giveaway.description) {
            embed.setDescription(giveaway.description);
        }

        const joinButton = new ButtonBuilder()
            .setCustomId(`giveaway_join_${giveaway.id}`)
            .setLabel(giveaway.is_ended ? '已結束' : '參加抽獎')
            .setStyle(giveaway.is_ended ? ButtonStyle.Danger : ButtonStyle.Primary)
            .setEmoji(giveaway.is_ended ? '🔒' : '🎟️')
            .setDisabled(giveaway.is_ended);

        const participantsButton = new ButtonBuilder()
            .setCustomId(`giveaway_participants_${giveaway.id}`)
            .setLabel(`${giveaway.participants.length} 人參加`)
            .setStyle(ButtonStyle.Secondary)
            .setEmoji('👥');

        const row = new ActionRowBuilder()
            .addComponents(joinButton, participantsButton);

        await interaction.message.edit({
            embeds: [embed],
            components: [row]
        });

    } catch (error) {
        console.error('❌ 更新抽獎訊息時發生錯誤：', error);
    }
}

// 處理選單互動
async function handleSelectMenu(interaction) {
    await interaction.reply({
        content: '❌ 選單功能尚未實作！',
        ephemeral: true
    });
}