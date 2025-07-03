const { REST, Routes } = require('discord.js');
const fs = require('node:fs');
const path = require('node:path');
const { Client, GatewayIntentBits } = require('discord.js');
require('dotenv').config();

async function deployCommands() {
    try {
        const client = new Client({ 
            intents: [GatewayIntentBits.Guilds] 
        });

        const commands = [];
        const foldersPath = path.join(__dirname, 'commands');
        const commandFolders = fs.readdirSync(foldersPath);

        for (const folder of commandFolders) {
            const commandsPath = path.join(foldersPath, folder);
            const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));
            
            for (const file of commandFiles) {
                const filePath = path.join(commandsPath, file);
                try {
                    delete require.cache[require.resolve(filePath)];
                    const command = require(filePath);
                    
                    if ('data' in command && 'execute' in command) {
                        commands.push(command.data.toJSON());
                        console.log(`✅ 已載入命令：${command.data.name} (${filePath})`);
                    }
                } catch (error) {
                    console.error(`❌ 載入命令時發生錯誤 ${filePath}:`, error);
                }
            }
        }

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

    } catch (error) {
        console.error('❌ 部署過程發生錯誤：', error);
        process.exit(1);
    }
}

deployCommands();