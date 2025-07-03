import { REST, Routes, Client, GatewayIntentBits } from 'discord.js';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();

async function deployCommands() {
    try {
        // 驗證環境變數
        if (!process.env.TOKEN) {
            throw new Error('找不到 Discord Bot Token！請確認 .env 檔案中有設定 TOKEN。');
        }
        if (!process.env.CLIENT_ID) {
            throw new Error('找不到 Client ID！請確認 .env 檔案中有設定 CLIENT_ID。');
        }

        const client = new Client({ 
            intents: [GatewayIntentBits.Guilds] 
        });

        const commands = [];
        const foldersPath = path.join(__dirname, 'commands');
        
        if (!fs.existsSync(foldersPath)) {
            throw new Error(`指令資料夾不存在：${foldersPath}`);
        }

        const commandFolders = fs.readdirSync(foldersPath);
        console.log(`載入 ${commandFolders.length} 個指令資料夾...`);

        for (const folder of commandFolders) {
            const commandsPath = path.join(foldersPath, folder);
            const stat = fs.statSync(commandsPath);
            
            if (!stat.isDirectory()) continue;
            
            const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));
            
            for (const file of commandFiles) {
                const filePath = path.join(commandsPath, file);
                try {
                    const command = await import(`file://${filePath}?t=${Date.now()}`);
                    const commandModule = command.default || command;
                    
                    if ('data' in commandModule && 'execute' in commandModule) {
                        commands.push(commandModule.data.toJSON());
                        console.log(`✅ 已載入命令：${commandModule.data.name} (${filePath})`);
                    } else {
                        console.log(`❌ [警告] ${filePath} 中的命令缺少必要的 "data" 或 "execute" 屬性`);
                    }
                } catch (error) {
                    console.error(`❌ 載入命令時發生錯誤 ${filePath}:`, error);
                }
            }
        }

        console.log(`\n總共載入 ${commands.length} 個命令`);

        await client.login(process.env.TOKEN);
        const guilds = Array.from(client.guilds.cache.values());
        console.log(`\n找到 ${guilds.length} 個伺服器`);

        const rest = new REST().setToken(process.env.TOKEN);

        for (const guild of guilds) {
            try {
                console.log(`\n正在部署命令到伺服器：${guild.name} (${guild.id})`);
                const data = await rest.put(
                    Routes.applicationGuildCommands(process.env.CLIENT_ID, guild.id),
                    { body: commands }
                );
                console.log(`✅ 成功在伺服器 ${guild.name} 部署 ${data.length} 個斜線命令！`);
            } catch (error) {
                console.error(`❌ 在伺服器 ${guild.name} 部署命令時發生錯誤：`, error);
            }
        }

        client.destroy();
        console.log('\n✅ 命令部署完成！');

    } catch (error) {
        console.error('❌ 部署過程發生錯誤：', error);
        if (error.code === 50001) {
            console.error('缺少權限！請確認機器人有足夠的權限來註冊命令。');
        }
        process.exit(1);
    }
}

deployCommands();
