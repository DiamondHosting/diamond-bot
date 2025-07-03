import { SlashCommandBuilder, ChannelType } from 'discord.js';

export default {
    data: new SlashCommandBuilder()
        .setName('語音')
        .setDescription('語音頻道管理系統')
        .addSubcommand(subcommand =>
            subcommand
                .setName('更改地區')
                .setDescription('更改語音頻道的地區')
                .addChannelOption(option =>
                    option.setName('頻道')
                        .setDescription('要更改的語音頻道')
                        .addChannelTypes(ChannelType.GuildVoice)
                        .setRequired(true))
                .addStringOption(option =>
                    option.setName('地區')
                        .setDescription('語音頻道地區')
                        .setRequired(true)
                        .addChoices(
                            { name: '日本', value: 'japan' },
                            { name: '香港', value: 'hongkong' },
                            { name: '新加坡', value: 'singapore' },
                            { name: '南韓', value: 'south-korea' },
                            { name: '印度', value: 'india' },
                            { name: '自動', value: 'auto' }
                        )))
        .addSubcommand(subcommand =>
            subcommand
                .setName('設定人數')
                .setDescription('設定語音頻道人數限制')
                .addChannelOption(option =>
                    option.setName('頻道')
                        .setDescription('要設定的語音頻道')
                        .addChannelTypes(ChannelType.GuildVoice)
                        .setRequired(true))
                .addIntegerOption(option =>
                    option.setName('人數')
                        .setDescription('人數限制（0表示無限制）')
                        .setRequired(true)
                        .setMinValue(0)
                        .setMaxValue(99)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('改名')
                .setDescription('更改語音頻道名稱')
                .addChannelOption(option =>
                    option.setName('頻道')
                        .setDescription('要更改的語音頻道')
                        .addChannelTypes(ChannelType.GuildVoice)
                        .setRequired(true))
                .addStringOption(option =>
                    option.setName('名稱')
                        .setDescription('新的頻道名稱')
                        .setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('資訊')
                .setDescription('查看語音頻道資訊')
                .addChannelOption(option =>
                    option.setName('頻道')
                        .setDescription('要查看的語音頻道')
                        .addChannelTypes(ChannelType.GuildVoice)
                        .setRequired(true))),

    async execute(interaction) {
        const subcommand = interaction.options.getSubcommand();
        const channel = interaction.options.getChannel('頻道');

        if (!interaction.member.permissions.has('ManageChannels') && 
            !interaction.member.permissions.has('Administrator')) {
            return interaction.reply({
                content: '你沒有管理語音頻道的權限！',
                ephemeral: true
            });
        }

        try {
            if (subcommand === '更改地區') {
                const region = interaction.options.getString('地區');
                await channel.setRTCRegion(region);
                await interaction.reply({
                    content: `已將 ${channel.name} 的地區更改為 ${region}`,
                    ephemeral: true
                });

            } else if (subcommand === '設定人數') {
                const limit = interaction.options.getInteger('人數');
                await channel.setUserLimit(limit === 0 ? null : limit);
                await interaction.reply({
                    content: `已將 ${channel.name} 的人數限制設為 ${limit === 0 ? '無限制' : limit}`,
                    ephemeral: true
                });

            } else if (subcommand === '改名') {
                const newName = interaction.options.getString('名稱');
                const oldName = channel.name;
                await channel.setName(newName);
                await interaction.reply({
                    content: `已將頻道名稱從 ${oldName} 改為 ${newName}`,
                    ephemeral: true
                });

            } else if (subcommand === '資訊') {
                const members = channel.members.map(member => member.user.tag);
                const embed = {
                    color: 0x0099ff,
                    title: `${channel.name} 的資訊`,
                    fields: [
                        {
                            name: '頻道ID',
                            value: channel.id,
                            inline: true
                        },
                        {
                            name: '目前人數',
                            value: `${channel.members.size}${channel.userLimit ? `/${channel.userLimit}` : ''}`,
                            inline: true
                        },
                        {
                            name: '地區',
                            value: channel.rtcRegion || '自動',
                            inline: true
                        },
                        {
                            name: '位元率',
                            value: `${channel.bitrate / 1000}kbps`,
                            inline: true
                        }
                    ]
                };

                if (members.length > 0) {
                    embed.fields.push({
                        name: '目前成員',
                        value: members.join('\n'),
                        inline: false
                    });
                }

                await interaction.reply({ embeds: [embed], ephemeral: true });
            }
        } catch (error) {
            console.error(error);
            await interaction.reply({
                content: '執行命令時發生錯誤！',
                ephemeral: true
            });
        }
    }
}; 