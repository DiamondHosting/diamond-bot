const { db } = require('../utils/database');
const { EmbedBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder } = require('discord.js');
const Poll = require('../models/Poll');
const cron = require('node-cron');

module.exports = {
    name: 'interactionCreate',
    async execute(interaction) {
        if (!this.client) {
            this.client = interaction.client;
        }

        if (!this.checkInterval) {
            this.checkInterval = setInterval(async () => {
                try {
                    const now = Date.now();
                    const endedGiveaways = db.prepare(`
                        SELECT * FROM giveaways 
                        WHERE is_ended = 0 AND end_time <= ?
                    `).all(now);

                    for (const giveaway of endedGiveaways) {
                        await endGiveaway(giveaway.id, this.client);
                    }
                } catch (error) {
                    console.error('檢查抽獎結束時發生錯誤：', error);
                }
            }, 60000);
        }

        if (interaction.isButton()) {
            if (interaction.customId.startsWith('vote_')) {
                try {
                    const pollId = interaction.message.interaction.id;
                    const optionNumber = parseInt(interaction.customId.split('_')[1]);
                    
                    const poll = await Poll.findById(pollId);
                    if (!poll || poll.is_ended) {
                        return await interaction.reply({
                            content: '❌ 這個投票已經結束了！',
                            ephemeral: true
                        });
                    }

                    if (poll.restrict_role) {
                        const member = await interaction.guild.members.fetch(interaction.user.id);
                        if (!member.roles.cache.has(poll.restrict_role)) {
                            return await interaction.reply({
                                content: '❌ 你沒有參與這個投票的權限！需要擁有指定的身分組。',
                                ephemeral: true
                            });
                        }
                    }

                    if (!poll.votes[interaction.user.id]) {
                        poll.votes[interaction.user.id] = [];
                    }

                    const userVotes = poll.votes[interaction.user.id];
                    const voteIndex = userVotes.indexOf(optionNumber);

                    if (voteIndex !== -1) {
                        userVotes.splice(voteIndex, 1);
                        await poll.save();
                        await interaction.reply({
                            content: `✅ 已取消投票：${poll.options[optionNumber]}`,
                            ephemeral: true
                        });
                    } else {
                        if (userVotes.length >= poll.max_choices) {
                            return await interaction.reply({
                                content: `❌ 你最多只能選擇 ${poll.max_choices} 個選項！`,
                                ephemeral: true
                            });
                        }

                        userVotes.push(optionNumber);
                        await poll.save();
                        await interaction.reply({
                            content: `✅ 已投票給：${poll.options[optionNumber]}\n` +
                                    `你還可以選擇 ${poll.max_choices - userVotes.length} 個選項`,
                            ephemeral: true
                        });
                    }

                } catch (error) {
                    console.error('處理投票時發生錯誤：', error);
                    await interaction.reply({
                        content: '❌ 處理投票時發生錯誤！',
                        ephemeral: true
                    });
                }
            } else if (interaction.customId === 'show_voters' || interaction.customId === 'show_results') {
                try {
                    const pollId = interaction.message.interaction.id;
                    const poll = await Poll.findById(pollId);
                    
                    if (!poll) {
                        return await interaction.reply({
                            content: '❌ 找不到這個投票！',
                            ephemeral: true
                        });
                    }

                    const member = await interaction.guild.members.fetch(interaction.user.id);
                    const hasPermission = poll.is_public || 
                                        poll.host_id === interaction.user.id || 
                                        member.permissions.has('Administrator');

                    if (!hasPermission) {
                        return await interaction.reply({
                            content: '❌ 這是一個不公開的投票，只有管理員和投票發起人可以查看結果！',
                            ephemeral: true
                        });
                    }

                    if (interaction.customId === 'show_voters') {
                        const votersList = await Promise.all(
                            Object.entries(poll.votes).map(async ([userId, optionIndex]) => {
                                try {
                                    const member = await interaction.guild.members.fetch(userId);
                                    return `<@${member.id}> - ${poll.options[optionIndex]}`;
                                } catch {
                                    return '未知用戶';
                                }
                            })
                        );

                        const embed = new EmbedBuilder()
                            .setColor('#FFD700')
                            .setTitle('📊 投票者清單')
                            .setDescription(votersList.length > 0 ? 
                                votersList.join('\n') : 
                                '目前還沒有人投票')
                            .setFooter({ 
                                text: `總投票人數: ${votersList.length}`, 
                                iconURL: interaction.user.displayAvatarURL() 
                            });

                        await interaction.reply({
                            embeds: [embed],
                            ephemeral: true
                        });

                    } else {
                        const votersByOption = {};
                        for (const [userId, userVotes] of Object.entries(poll.votes)) {
                            for (const optionIndex of userVotes) {
                                if (!votersByOption[optionIndex]) {
                                    votersByOption[optionIndex] = [];
                                }
                                try {
                                    const member = await interaction.guild.members.fetch(userId);
                                    votersByOption[optionIndex].push(`<@${member.id}>`);
                                } catch {
                                    votersByOption[optionIndex].push('未知用戶');
                                }
                            }
                        }

                        const totalVotes = Object.values(votersByOption)
                            .reduce((sum, voters) => sum + voters.length, 0);

                        const resultEmbed = new EmbedBuilder()
                            .setColor('#FFD700')
                            .setTitle(`📊 投票結果：${poll.question}`)
                            .setDescription(poll.options.map((opt, i) => {
                                const voters = votersByOption[i] || [];
                                const percentage = totalVotes > 0 ? (voters.length / totalVotes * 100).toFixed(1) : 0;
                                return `**${opt}** (${percentage}%)\n投票者：${voters.join(', ') || '無'}\n`;
                            }).join('\n'))
                            .setFooter({ 
                                text: `總投票數: ${totalVotes} | 投票人數: ${Object.keys(poll.votes).length}`, 
                                iconURL: interaction.user.displayAvatarURL() 
                            })
                            .setTimestamp();

                        await interaction.reply({
                            embeds: [resultEmbed],
                            ephemeral: true
                        });
                    }

                } catch (error) {
                    console.error('顯示資訊時發生錯誤：', error);
                    await interaction.reply({
                        content: '❌ 顯示資訊時發生錯誤！',
                        ephemeral: true
                    });
                }
            } else if (interaction.customId === 'end_poll') {
                try {
                    const pollId = interaction.message.interaction.id;
                    const poll = await Poll.findById(pollId);
                    
                    if (!poll) {
                        return await interaction.reply({
                            content: '❌ 找不到這個投票！',
                            ephemeral: true
                        });
                    }

                    if (poll.host_id !== interaction.user.id) {
                        return await interaction.reply({
                            content: '❌ 只有投票發起人可以提前結束投票！',
                            ephemeral: true
                        });
                    }

                    await endPoll(pollId, interaction);
                    await interaction.reply({
                        content: '✅ 投票已結束！',
                        ephemeral: true
                    });

                } catch (error) {
                    console.error('結束投票時發生錯誤：', error);
                    await interaction.reply({
                        content: '❌ 結束投票時發生錯誤！',
                        ephemeral: true
                    });
                }
            } else if (interaction.customId.startsWith('giveaway_join_')) {
                const giveawayId = interaction.customId.split('_')[2];
                
                const giveaway = db.prepare('SELECT * FROM giveaways WHERE id = ?').get(giveawayId);
                if (!giveaway || giveaway.is_ended) {
                    return interaction.reply({
                        content: '這個抽獎已經結束了！',
                        ephemeral: true
                    });
                }

                if (giveaway.role_requirement) {
                    const member = await interaction.guild.members.fetch(interaction.user.id);
                    if (!member.roles.cache.has(giveaway.role_requirement)) {
                        return interaction.reply({
                            content: '你沒有參與這個抽獎的權限！',
                            ephemeral: true
                        });
                    }
                }

                const existing = db.prepare(`
                    SELECT * FROM giveaway_participants 
                    WHERE giveaway_id = ? AND user_id = ?
                `).get(giveawayId, interaction.user.id);

                if (existing) {
                    db.prepare(`
                        DELETE FROM giveaway_participants 
                        WHERE giveaway_id = ? AND user_id = ?
                    `).run(giveawayId, interaction.user.id);

                    await interaction.reply({
                        content: '你已取消參加這個抽獎！',
                        ephemeral: true
                    });
                } else {
                    db.prepare(`
                        INSERT INTO giveaway_participants (giveaway_id, user_id)
                        VALUES (?, ?)
                    `).run(giveawayId, interaction.user.id);

                    await interaction.reply({
                        content: '你已成功參加抽獎！',
                        ephemeral: true
                    });
                }

                const participantCount = db.prepare(`
                    SELECT COUNT(*) as count 
                    FROM giveaway_participants 
                    WHERE giveaway_id = ?
                `).get(giveawayId).count;

                const components = interaction.message.components;
                const participantsButton = components[0].components[1];
                participantsButton.data.label = `${participantCount} 人參加`;

                await interaction.message.edit({ 
                    components: components
                });

                const endTime = new Date(giveaway.end_time);
                const cronTime = `${endTime.getMinutes()} ${endTime.getHours()} ${endTime.getDate()} ${endTime.getMonth() + 1} *`;
                
                cron.schedule(cronTime, async () => {
                    try {
                        await endGiveaway(giveawayId, this.client);
                    } catch (error) {
                        console.error('結束抽獎時發生錯誤：', error);
                    }
                }, {
                    timezone: "Asia/Taipei"
                });
            } else if (interaction.customId.startsWith('giveaway_participants_')) {
                const giveawayId = interaction.customId.split('_')[2];
                
                const participants = db.prepare(`
                    SELECT user_id, joined_at 
                    FROM giveaway_participants 
                    WHERE giveaway_id = ?
                    ORDER BY joined_at ASC
                `).all(giveawayId);

                const giveaway = db.prepare('SELECT * FROM giveaways WHERE id = ?').get(giveawayId);
                if (!giveaway) {
                    return interaction.reply({
                        content: '找不到這個抽獎！',
                        ephemeral: true
                    });
                }

                const participantsList = await Promise.all(participants.map(async (p, index) => {
                    try {
                        const member = await interaction.guild.members.fetch(p.user_id);
                        const joinTime = new Date(p.joined_at * 1000);
                        return `${index + 1}. ${member} (${joinTime.toLocaleTimeString()})`;
                    } catch {
                        return `${index + 1}. 未知用戶`;
                    }
                }));

                const embed = new EmbedBuilder()
                    .setColor('#FFD700')
                    .setTitle(`🎉 抽獎參加者列表`)
                    .setDescription(participantsList.length > 0 ? 
                        participantsList.join('\n') : 
                        '目前還沒有人參加！')
                    .setFooter({ 
                        text: `共 ${participantsList.length} 人參加`, 
                        iconURL: interaction.guild.iconURL() 
                    });

                await interaction.reply({
                    embeds: [embed],
                    ephemeral: true
                });
            } else if (interaction.customId.startsWith('giveaway_claimed_') || 
                       interaction.customId.startsWith('giveaway_reroll_')) {
                
                if (!interaction.member.permissions.has('Administrator')) {
                    return interaction.reply({
                        content: '❌ 只有管理員可以使用此功能！',
                        ephemeral: true
                    });
                }

                const giveawayId = interaction.customId.split('_')[2];
                const giveaway = db.prepare('SELECT * FROM giveaways WHERE id = ?').get(giveawayId);
                
                if (!giveaway) {
                    return interaction.reply({
                        content: '❌ 找不到這個抽獎！',
                        ephemeral: true
                    });
                }

                if (interaction.customId.startsWith('giveaway_claimed_')) {
                    const channel = await interaction.client.channels.fetch(giveaway.channel_id);
                    const originalMessage = await channel.messages.fetch(giveaway.message_id);
                    
                    if (originalMessage) {
                        const originalEmbed = originalMessage.embeds[0];
                        const winners = db.prepare(`
                            SELECT user_id FROM giveaway_winners 
                            WHERE giveaway_id = ? 
                            ORDER BY won_at ASC
                        `).all(giveawayId);
                        
                        const winnersText = winners.map(w => `<@${w.user_id}>`).join(', ');
                        
                        if (winnersText) {
                            const newEmbed = EmbedBuilder.from(originalEmbed)
                                .addFields({ name: '🏆 得獎者', value: winnersText });
                            
                            await originalMessage.edit({ embeds: [newEmbed] });
                        }
                    }

                    const row = ActionRowBuilder.from(interaction.message.components[0]);
                    row.components.forEach(button => button.setDisabled(true));
                    
                    await interaction.message.edit({ 
                        components: [row]
                    });

                    await interaction.reply({ 
                        content: '✅ 獎品已領取！',
                        ephemeral: true
                    });

                } else if (interaction.customId.startsWith('giveaway_reroll_')) {
                    const giveawayId = interaction.customId.split('_')[2];
                    const giveaway = db.prepare('SELECT * FROM giveaways WHERE id = ?').get(giveawayId);
                    
                    const participants = db.prepare(`
                        SELECT user_id 
                        FROM giveaway_participants 
                        WHERE giveaway_id = ?
                    `).all(giveawayId);

                    if (participants.length === 0) {
                        return interaction.reply({
                            content: '❌ 沒有參加者可以抽獎！',
                            ephemeral: true
                        });
                    }

                    const winners = [];
                    const participantIds = participants.map(p => p.user_id);
                    for (let i = 0; i < Math.min(giveaway.winners_count, participants.length); i++) {
                        const winnerIndex = Math.floor(Math.random() * participantIds.length);
                        winners.push(participantIds[winnerIndex]);
                        participantIds.splice(winnerIndex, 1);
                    }

                    db.prepare(`
                        DELETE FROM giveaway_winners 
                        WHERE giveaway_id = ?
                    `).run(giveawayId);

                    const stmt = db.prepare(`
                        INSERT INTO giveaway_winners (giveaway_id, user_id, won_at)
                        VALUES (?, ?, ?)
                    `);
                    
                    winners.forEach(winnerId => {
                        stmt.run(giveawayId, winnerId, Date.now());
                    });

                    const currentRow = ActionRowBuilder.from(interaction.message.components[0]);
                    currentRow.components.forEach(button => button.setDisabled(true));
                    await interaction.message.edit({ 
                        components: [currentRow]
                    });

                    await interaction.reply({
                        content: '❌ 已重新抽獎，原得獎者未領取',
                        ephemeral: true
                    });

                    const winnersText = winners.map(id => `<@${id}>`).join(', ');
                    const winnerEmbed = new EmbedBuilder()
                        .setColor('#FFD700')
                        .setTitle('🎉 新抽獎結果')
                        .setDescription(`**獎品：${giveaway.prize}**\n\n🏆 新得獎者：${winnersText}`)
                        .setFooter({ 
                            text: '請管理員確認得獎者是否已領取獎品',
                            iconURL: interaction.client.user.displayAvatarURL()
                        })
                        .setTimestamp();

                    const adminRow = new ActionRowBuilder()
                        .addComponents(
                            new ButtonBuilder()
                                .setCustomId(`giveaway_claimed_${giveawayId}`)
                                .setLabel('已領')
                                .setStyle(ButtonStyle.Success)
                                .setEmoji('✅'),
                            new ButtonBuilder()
                                .setCustomId(`giveaway_reroll_${giveawayId}`)
                                .setLabel('重新抽獎')
                                .setStyle(ButtonStyle.Danger)
                                .setEmoji('🎲')
                        );

                    await interaction.channel.send({
                        embeds: [winnerEmbed],
                        components: [adminRow]
                    });
                }
            }
        } else if (interaction.isChatInputCommand()) {
            const command = interaction.client.commands.get(interaction.commandName);

            if (!command) {
                console.error(`找不到命令 ${interaction.commandName}`);
                return;
            }

            try {
                await command.execute(interaction);
            } catch (error) {
                console.error(error);
                if (interaction.replied || interaction.deferred) {
                    await interaction.followUp({
                        content: '執行命令時發生錯誤！',
                        ephemeral: true
                    });
                } else {
                    await interaction.reply({
                        content: '執行命令時發生錯誤！',
                        ephemeral: true
                    });
                }
            }
        }
    },
};

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