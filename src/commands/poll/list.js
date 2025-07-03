const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
const Poll = require('../../models/Poll');

const POLLS_PER_PAGE = 3;

module.exports = {
    data: new SlashCommandBuilder()
        .setName('投票列表')
        .setDescription('查看目前進行中的投票'),

    async execute(interaction) {
        try {
            const activePolls = await Poll.findActive(interaction.guildId);

            if (activePolls.length === 0) {
                return await interaction.reply({
                    content: '目前沒有進行中的投票！',
                    ephemeral: true
                });
            }

            const totalPages = Math.ceil(activePolls.length / POLLS_PER_PAGE);
            let currentPage = 1;

            const getPageEmbed = (page) => {
                const startIndex = (page - 1) * POLLS_PER_PAGE;
                const endIndex = startIndex + POLLS_PER_PAGE;
                const pagePolls = activePolls.slice(startIndex, endIndex);

                return new EmbedBuilder()
                    .setColor('#FFD700')
                    .setTitle('📊 進行中的投票')
                    .setDescription(
                        pagePolls.map(poll => {
                            const endTime = Math.floor(poll.end_time / 1000);
                            const totalVotes = Object.keys(poll.votes).length;
                            return `**${poll.question}**\n` +
                                   `投票人數：${totalVotes} 人\n` +
                                   `結束時間：<t:${endTime}:F> (<t:${endTime}:R>)\n` +
                                   `[點擊前往](https://discord.com/channels/${poll.guild_id}/${poll.channel_id}/${poll.message_id})\n`;
                        }).join('\n\n')
                    )
                    .setFooter({ 
                        text: `共 ${activePolls.length} 個進行中的投票 • 第 ${page}/${totalPages} 頁`, 
                        iconURL: interaction.guild.iconURL() 
                    });
            };

            const getButtons = (page) => {
                const row = new ActionRowBuilder()
                    .addComponents(
                        new ButtonBuilder()
                            .setCustomId('prev_page')
                            .setLabel('◀️ 上一頁')
                            .setStyle(ButtonStyle.Primary)
                            .setDisabled(page <= 1),
                        new ButtonBuilder()
                            .setCustomId('goto_page')
                            .setLabel(`${page}/${totalPages}`)
                            .setStyle(ButtonStyle.Secondary),
                        new ButtonBuilder()
                            .setCustomId('next_page')
                            .setLabel('下一頁 ▶️')
                            .setStyle(ButtonStyle.Primary)
                            .setDisabled(page >= totalPages)
                    );
                return row;
            };

            const message = await interaction.reply({
                embeds: [getPageEmbed(currentPage)],
                components: [getButtons(currentPage)],
                ephemeral: true,
                fetchReply: true
            });

            const collector = message.createMessageComponentCollector({
                componentType: ComponentType.Button,
                time: 300000
            });

            collector.on('collect', async (i) => {
                if (i.user.id !== interaction.user.id) {
                    return await i.reply({
                        content: '❌ 你不能使用這些按鈕！',
                        ephemeral: true
                    });
                }

                try {
                    if (i.customId === 'prev_page' && currentPage > 1) {
                        currentPage--;
                        await i.update({
                            embeds: [getPageEmbed(currentPage)],
                            components: [getButtons(currentPage)]
                        });
                    } else if (i.customId === 'next_page' && currentPage < totalPages) {
                        currentPage++;
                        await i.update({
                            embeds: [getPageEmbed(currentPage)],
                            components: [getButtons(currentPage)]
                        });
                    } else if (i.customId === 'goto_page') {
                        const modal = new ModalBuilder()
                            .setCustomId('page_select_modal')
                            .setTitle('選擇頁數')
                            .addComponents(
                                new ActionRowBuilder().addComponents(
                                    new TextInputBuilder()
                                        .setCustomId('page_number')
                                        .setLabel(`請輸入頁數 (1-${totalPages})`)
                                        .setStyle(TextInputStyle.Short)
                                        .setMinLength(1)
                                        .setMaxLength(2)
                                        .setRequired(true)
                                        .setPlaceholder('輸入數字...')
                                )
                            );

                        await i.showModal(modal);

                        try {
                            const modalSubmit = await i.awaitModalSubmit({
                                filter: (interaction) => interaction.customId === 'page_select_modal',
                                time: 30000
                            });

                            const newPage = parseInt(modalSubmit.fields.getTextInputValue('page_number'));
                            if (newPage >= 1 && newPage <= totalPages) {
                                currentPage = newPage;
                                await modalSubmit.update({
                                    embeds: [getPageEmbed(currentPage)],
                                    components: [getButtons(currentPage)]
                                });
                            } else {
                                await modalSubmit.reply({
                                    content: '❌ 無效的頁數！',
                                    ephemeral: true
                                });
                            }
                        } catch (error) {
                            console.error('模態框處理錯誤：', error);
                            if (error.code !== 'INTERACTION_COLLECTOR_ERROR') {
                                await i.followUp({
                                    content: '❌ 發生錯誤！',
                                    ephemeral: true
                                });
                            }
                        }
                    }
                } catch (error) {
                    console.error('按鈕處理錯誤：', error);
                    if (!i.replied && !i.deferred) {
                        await i.reply({
                            content: '❌ 發生錯誤！',
                            ephemeral: true
                        });
                    }
                }
            });

            collector.on('end', () => {
                interaction.editReply({
                    components: []
                }).catch(console.error);
            });

        } catch (error) {
            console.error('查詢投票列表時發生錯誤：', error);
            await interaction.reply({
                content: '❌ 查詢投票列表時發生錯誤！',
                ephemeral: true
            });
        }
    }
}; 