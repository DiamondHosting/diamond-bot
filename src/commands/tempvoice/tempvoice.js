const { SlashCommandBuilder, ChannelType, PermissionFlagsBits } = require('discord.js');
const { db } = require('../../utils/database');

db.exec(`
    CREATE TABLE IF NOT EXISTS temp_voice_settings (
        guild_id TEXT PRIMARY KEY,
        category_id TEXT,
        base_channel_id TEXT
    )
`);

db.exec(`
    CREATE TABLE IF NOT EXISTS temp_voice_channels (
        channel_id TEXT PRIMARY KEY,
        guild_id TEXT,
        owner_id TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
`);

module.exports = {
    data: new SlashCommandBuilder()
        .setName('臨時語音')
        .setDescription('臨時語音系統')
        .addSubcommand(subcommand =>
            subcommand
                .setName('創建')
                .setDescription('創建臨時語音頻道')
                .addStringOption(option =>
                    option.setName('名稱')
                        .setDescription('頻道名稱')
                        .setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('設定類別')
                .setDescription('設定臨時語音類別')
                .addChannelOption(option =>
                    option.setName('類別')
                        .setDescription('臨時語音類別')
                        .addChannelTypes(ChannelType.GuildCategory)
                        .setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('設定')
                .setDescription('設定臨時語音頻道')
                .addIntegerOption(option =>
                    option.setName('人數限制')
                        .setDescription('設定人數限制（-1為不限制）')
                        .setRequired(true))
                .addStringOption(option =>
                    option.setName('區域')
                        .setDescription('設定語音區域')
                        .addChoices(
                            { name: '日本', value: 'japan' },
                            { name: '香港', value: 'hongkong' },
                            { name: '新加坡', value: 'singapore' },
                            { name: '南韓', value: 'south-korea' },
                            { name: '印度', value: 'india' },
                            { name: '自動', value: 'auto' }
                        ))),

    async execute(interaction) {
        const subcommand = interaction.options.getSubcommand();

        if (subcommand === '創建') {
            const channelName = interaction.options.getString('名稱');
            const settings = db.prepare('SELECT * FROM temp_voice_settings WHERE guild_id = ?')
                .get(interaction.guildId);
            if (!settings) {
                return interaction.reply({
                    content: '請先使用 `/臨時語音 設定類別` 設定臨時語音類別！',
                    ephemeral: true
                });
            }
            try {
                const channel = await interaction.guild.channels.create({
                    name: channelName,
                    type: ChannelType.GuildVoice,
                    parent: settings.category_id,
                    permissionOverwrites: [
                        {
                            id: interaction.user.id,
                            allow: [
                                PermissionFlagsBits.ManageChannels,
                                PermissionFlagsBits.MuteMembers,
                                PermissionFlagsBits.DeafenMembers,
                                PermissionFlagsBits.MoveMembers
                            ]
                        }
                    ]
                });
                db.prepare(`
                    INSERT INTO temp_voice_channels (channel_id, guild_id, owner_id)
                    VALUES (?, ?, ?)
                `).run(channel.id, interaction.guildId, interaction.user.id);

                await interaction.reply({
                    content: `已創建臨時語音頻道：${channel.name}`,
                    ephemeral: true
                });

            } catch (error) {
                console.error(error);
                await interaction.reply({
                    content: '創建頻道時發生錯誤！',
                    ephemeral: true
                });
            }

        } else if (subcommand === '設定類別') {
            if (!interaction.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
                return interaction.reply({
                    content: '你沒有權限設定臨時語音類別！',
                    ephemeral: true
                });
            }
            const category = interaction.options.getChannel('類別');
            db.prepare(`
                INSERT OR REPLACE INTO temp_voice_settings (guild_id, category_id)
                VALUES (?, ?)
            `).run(interaction.guildId, category.id);

            await interaction.reply({
                content: `已設定臨時語音類別為：${category.name}`,
                ephemeral: true
            });

        } else if (subcommand === '設定') {
            const userLimit = interaction.options.getInteger('人數限制');
            const region = interaction.options.getString('區域');
            const voiceChannel = interaction.member.voice.channel;
            if (!voiceChannel) {
                return interaction.reply({
                    content: '你必須在語音頻道中才能使用此命令！',
                    ephemeral: true
                });
            }
            const tempChannel = db.prepare(`
                SELECT * FROM temp_voice_channels 
                WHERE channel_id = ? AND owner_id = ?
            `).get(voiceChannel.id, interaction.user.id);

            if (!tempChannel) {
                return interaction.reply({
                    content: '你不是此臨時語音頻道的擁有者！',
                    ephemeral: true
                });
            }
            try {
                await voiceChannel.setUserLimit(userLimit === -1 ? null : userLimit);
                if (region) {
                    await voiceChannel.setRTCRegion(region);
                }
                await interaction.reply({
                    content: `已更新頻道設定！\n人數限制：${userLimit === -1 ? '無限制' : userLimit}${region ? `\n區域：${region}` : ''}`,
                    ephemeral: true
                });

            } catch (error) {
                console.error(error);
                await interaction.reply({
                    content: '更新頻道設定時發生錯誤！',
                    ephemeral: true
                });
            }
        }
    }
}; 