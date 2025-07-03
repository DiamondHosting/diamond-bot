import { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionFlagsBits } from 'discord.js';
import Giveaway from '../../models/Giveaway.js';

// 時間解析輔助函數
function parseEndTime(timeStr) {
    const timeRegex = /^(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2})$/;
    const match = timeStr.match(timeRegex);
    
    if (!match) {
        throw new Error('時間格式錯誤！請使用 YYYY-MM-DD HH:mm 格式');
    }
    
    const [, year, month, day, hour, minute] = match;
    const endTime = new Date(year, month - 1, day, hour, minute);
    
    if (isNaN(endTime.getTime())) {
        throw new Error('無效的時間！');
    }
    
    const now = new Date();
    const minEndTime = new Date(now.getTime() + 60000); // 至少 1 分鐘後
    const maxEndTime = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000); // 最多 30 天後
    
    if (endTime <= minEndTime) {
        throw new Error('結束時間必須至少在 1 分鐘後！');
    }
    
    if (endTime > maxEndTime) {
        throw new Error('結束時間不能超過 30 天！');
    }
    
    return endTime;
}

export default {
    data: new SlashCommandBuilder()
        .setName('抽獎')
        .setDescription('抽獎相關指令')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageEvents)
        .addSubcommand(subcommand =>
            subcommand
                .setName('發起')
                .setDescription('發起一個新抽獎')
                .addStringOption(option =>
                    option.setName('獎品')
                        .setDescription('抽獎的獎品')
                        .setRequired(true)
                        .setMaxLength(100))
                .addIntegerOption(option =>
                    option.setName('得獎人數')
                        .setDescription('抽出的得獎人數')
                        .setMinValue(1)
                        .setMaxValue(20)
                        .setRequired(true))
                .addStringOption(option =>
                    option.setName('結束時間')
                        .setDescription('結束時間（格式：YYYY-MM-DD HH:mm）')
                        .setRequired(true))
                .addStringOption(option =>
                    option.setName('說明')
                        .setDescription('抽獎的詳細說明，\\n 表示換行')
                        .setRequired(false)
                        .setMaxLength(500))
                .addRoleOption(option =>
                    option.setName('限制身分組')
                        .setDescription('限制哪些身分組可以參加')
                        .setRequired(false))
                .addRoleOption(option =>
                    option.setName('提及身分組')
                        .setDescription('要提及的身分組')
                        .setRequired(false))
                .addBooleanOption(option =>
                    option.setName('允許重複參加')
                        .setDescription('是否允許用戶重複參加')
                        .setRequired(false))),

    async execute(interaction) {
        if (interaction.options.getSubcommand() === '發起') {
            try {
                // 權限檢查
                if (!interaction.member.permissions.has(PermissionFlagsBits.ManageEvents)) {
                    return await interaction.reply({
                        content: '❌ 你沒有權限使用此指令！需要「管理活動」權限。',
                        ephemeral: true
                    });
                }

                const prize = interaction.options.getString('獎品')?.trim();
                const description = interaction.options.getString('說明')?.trim();
                const winnersCount = interaction.options.getInteger('得獎人數');
                const endTimeStr = interaction.options.getString('結束時間')?.trim();
                const restrictRole = interaction.options.getRole('限制身分組');
                const mentionRole = interaction.options.getRole('提及身分組');
                const allowDuplicate = interaction.options.getBoolean('允許重複參加') ?? false;

                // 輸入驗證
                if (!prize) {
                    return await interaction.reply({
                        content: '❌ 獎品名稱不能為空！',
                        ephemeral: true
                    });
                }

                if (!endTimeStr) {
                    return await interaction.reply({
                        content: '❌ 請提供結束時間！',
                        ephemeral: true
                    });
                }

                let endTime;
                try {
                    endTime = parseEndTime(endTimeStr);
                } catch (error) {
                    return await interaction.reply({
                        content: `❌ ${error.message}`,
                        ephemeral: true
                    });
                }

                const embed = new EmbedBuilder()
                    .setColor('#FFD700')
                    .setTitle(`🎉 抽獎：${prize}`)
                    .addFields(
                        { name: '🏆 得獎人數', value: `${winnersCount} 人`, inline: true },
                        { 
                            name: '⏰ 結束時間', 
                            value: `<t:${Math.floor(endTime.getTime() / 1000)}:F>\n倒數：<t:${Math.floor(endTime.getTime() / 1000)}:R>`, 
                            inline: false 
                        }
                    )
                    .setFooter({
                        text: `由 ${interaction.user.tag} 發起`,
                        iconURL: interaction.user.displayAvatarURL()
                    });

                // 只在有描述時才設置描述
                if (description && description.length > 0) {
                    embed.setDescription(description.replace(/\\n/g, '\n'));
                }

                if (restrictRole) {
                    embed.addFields({ name: '🔒 參加限制', value: restrictRole.toString(), inline: true });
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
                    is_ended: 0,
                    allow_duplicate: allowDuplicate
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