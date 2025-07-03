import { Client, Collection, GatewayIntentBits, ActivityType, Partials } from 'discord.js';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();

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

async function main() {
    const client = new Client({ 
        intents: [
            GatewayIntentBits.Guilds,
            GatewayIntentBits.GuildMessages,
            GatewayIntentBits.MessageContent,
            GatewayIntentBits.GuildMembers,
            GatewayIntentBits.GuildVoiceStates,
            GatewayIntentBits.GuildMessageReactions
        ],
        partials: [
            Partials.Message,
            Partials.Channel,
            Partials.Reaction
        ],
        allowedMentions: {
            parse: ['users', 'roles'],
            repliedUser: false
        }
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
                const command = await import(`file://${filePath}`);
                const commandModule = command.default || command;
                if ('data' in commandModule && 'execute' in commandModule) {
                    const commandName = commandModule.data.name;
                    if (client.commands.has(commandName)) {
                        console.log(`⚠️ 警告：指令 "${commandName}" 已存在，跳過載入 ${filePath}`);
                        continue;
                    }
                    client.commands.set(commandName, commandModule);
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
        const event = await import(`file://${filePath}`);
        const eventModule = event.default || event;
        if (eventModule.once) {
            client.once(eventModule.name, (...args) => eventModule.execute(...args));
        } else {
            client.on(eventModule.name, (...args) => eventModule.execute(...args));
        }
        console.log(`📝 已載入事件：${eventModule.name}`);
    }

    client.once('ready', async () => {
        console.log(`\n🤖 機器人 ${client.user.tag} 已上線！`);
        console.log(`📊 在 ${client.guilds.cache.size} 個伺服器中服務`);
        console.log(`👥 為 ${client.users.cache.size} 個用戶提供服務`);
        
        client.user.setPresence({
            activities: [{
                name: '鑽石託管服務',
                type: ActivityType.Playing
            }],
            status: 'online'
        });

        // 確保資料庫初始化
        try {
            const { initializeDatabase } = await import('./utils/database.js');
            initializeDatabase();
        } catch (error) {
            console.error('❌ 資料庫初始化失敗：', error);
        }
    });

    client.on('error', error => {
        console.error('❌ Discord 客戶端發生錯誤：', error);
    });

    client.on('warn', warning => {
        console.warn('⚠️ Discord 客戶端警告：', warning);
    });

    client.on('disconnect', () => {
        console.log('🔌 機器人已斷線');
    });

    client.on('reconnecting', () => {
        console.log('🔄 正在重新連接...');
    });

    client.on('resume', () => {
        console.log('✅ 連接已恢復');
    });

    process.on('unhandledRejection', (reason, promise) => {
        console.error('❌ 未處理的 Promise 拒絕：', reason);
        console.error('Promise:', promise);
    });

    process.on('uncaughtException', (error) => {
        console.error('❌ 未捕獲的異常：', error);
        process.exit(1);
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

    try {
        await client.login(process.env.TOKEN);
        console.log('🔑 Token 驗證成功！');
    } catch (error) {
        console.error('❌ Token 驗證失敗：', error);
        process.exit(1);
    }
}

main().catch(error => {
    console.error('❌ 應用程式啟動失敗：', error);
    process.exit(1);
});