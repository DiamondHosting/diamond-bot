const { Client, Collection, GatewayIntentBits, ActivityType } = require('discord.js');
const fs = require('node:fs');
const path = require('node:path');
require('dotenv').config();

console.log(`
╔═══════════════════════════════════════════════════════════════╗
║                                                               ║
║   ██████╗ ██╗ █████╗ ███╗   ███╗ ██████╗ ███╗   ██╗██████╗   ║
║   ██╔══██╗██║██╔══██╗████╗ ████║██╔═══██╗████╗  ██║██╔══██╗  ║
║   ██║  ██║██║███████║██╔████╔██║██║   ██║██╔██╗ ██║██║  ██║  ║
║   ██║  ██║██║██╔══██║██║╚██╔╝██║██║   ██║██║╚██╗██║██║  ██║  ║
║   ██████╔╝██║██║  ██║██║ ╚═╝ ██║╚██████╔╝██║ ╚████║██████╔╝  ║
║   ╚═════╝ ╚═╝╚═╝  ╚═╝╚═╝     ╚═╝ ╚═════╝ ╚═╝  ╚═══╝╚═════╝   ║
║                                                               ║
╚═══════════════════════════════════════════════════════════════╝
`);

const client = new Client({ 
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers
    ] 
});

client.commands = new Collection();

const foldersPath = path.join(__dirname, 'commands');
const commandFolders = fs.readdirSync(foldersPath);

for (const folder of commandFolders) {
    const commandsPath = path.join(foldersPath, folder);
    const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));
    
    for (const file of commandFiles) {
        const filePath = path.join(commandsPath, file);
        try {
            const command = require(filePath);
            if ('data' in command && 'execute' in command) {
                const commandName = command.data.name;
                if (client.commands.has(commandName)) {
                    console.log(`⚠️ 警告：指令 "${commandName}" 已存在，跳過載入 ${filePath}`);
                    continue;
                }
                client.commands.set(commandName, command);
                console.log(`✅ 已載入指令：${commandName}`);
            } else {
                console.log(`❌ [警告] ${filePath} 中的指令缺少必要的 "data" 或 "execute" 屬性`);
            }
        } catch (error) {
            console.error(`❌ 載入指令時發生錯誤 ${filePath}:`, error);
        }
    }
}

const eventsPath = path.join(__dirname, 'events');
const eventFiles = fs.readdirSync(eventsPath).filter(file => file.endsWith('.js'));

for (const file of eventFiles) {
    const filePath = path.join(eventsPath, file);
    const event = require(filePath);
    if (event.once) {
        client.once(event.name, (...args) => event.execute(...args));
    } else {
        client.on(event.name, (...args) => event.execute(...args));
    }
    console.log(`📝 已載入事件：${event.name}`);
}

client.once('ready', () => {
    console.log(`\n🤖 機器人 ${client.user.tag} 已上線！`);
    client.user.setPresence({
        activities: [{
            name: 'Discord',
            type: ActivityType.Playing
        }],
        status: 'online'
    });
});

client.on('error', error => {
    console.error('❌ 發生錯誤：', error);
});

process.on('unhandledRejection', error => {
    console.error('❌ 未處理的 Promise 拒絕：', error);
});

client.login(process.env.TOKEN)
    .then(() => {
        console.log('🔑 Token 驗證成功！');
    })
    .catch(error => {
        console.error('❌ Token 驗證失敗：', error);
    });

process.on('SIGINT', () => {
    console.log('正在關閉機器人...');
    client.destroy();
    process.exit(0);
});

process.on('SIGTERM', () => {
    console.log('正在關閉機器人...');
    client.destroy();
    process.exit(0);
}); 