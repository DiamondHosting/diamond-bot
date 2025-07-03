import { REST, Routes } from 'discord.js';
import dotenv from 'dotenv';

dotenv.config();

async function deleteCommands() {
    try {
        // 驗證環境變數
        if (!process.env.TOKEN) {
            throw new Error('找不到 Discord Bot Token！請確認 .env 檔案中有設定 TOKEN。');
        }
        if (!process.env.CLIENT_ID) {
            throw new Error('找不到 Client ID！請確認 .env 檔案中有設定 CLIENT_ID。');
        }

        const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);

        console.log('🔍 正在獲取現有的指令...');

        // 如果有指定特定伺服器
        if (process.env.GUILD_ID) {
            const commands = await rest.get(
                Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID)
            );

            console.log(`🎯 在指定伺服器找到 ${commands.length} 個指令，開始刪除...`);

            if (commands.length === 0) {
                console.log('✅ 指定伺服器沒有需要刪除的指令！');
                return;
            }

            for (const command of commands) {
                try {
                    await rest.delete(
                        Routes.applicationGuildCommand(process.env.CLIENT_ID, process.env.GUILD_ID, command.id)
                    );
                    console.log(`✅ 已刪除指令：${command.name}`);
                } catch (error) {
                    console.error(`❌ 刪除指令 ${command.name} 時發生錯誤：`, error.message);
                }
            }

            // 驗證刪除結果
            const remainingCommands = await rest.get(
                Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID)
            );

            if (remainingCommands.length === 0) {
                console.log('✅ 指定伺服器的所有指令已成功刪除！');
            } else {
                console.log(`⚠️ 警告：指定伺服器仍有 ${remainingCommands.length} 個指令未被刪除`);
            }
        } else {
            // 刪除全域指令
            console.log('🌐 正在刪除全域指令...');
            const globalCommands = await rest.get(
                Routes.applicationCommands(process.env.CLIENT_ID)
            );

            console.log(`找到 ${globalCommands.length} 個全域指令`);

            for (const command of globalCommands) {
                try {
                    await rest.delete(
                        Routes.applicationCommand(process.env.CLIENT_ID, command.id)
                    );
                    console.log(`✅ 已刪除全域指令：${command.name}`);
                } catch (error) {
                    console.error(`❌ 刪除全域指令 ${command.name} 時發生錯誤：`, error.message);
                }
            }

            const remainingGlobalCommands = await rest.get(
                Routes.applicationCommands(process.env.CLIENT_ID)
            );

            if (remainingGlobalCommands.length === 0) {
                console.log('✅ 所有全域指令已成功刪除！');
            } else {
                console.log(`⚠️ 警告：仍有 ${remainingGlobalCommands.length} 個全域指令未被刪除`);
            }
        }

    } catch (error) {
        console.error('❌ 刪除指令時發生錯誤：');
        if (error.code === 50001) {
            console.error('🔒 缺少權限！請確認機器人有足夠的權限來刪除指令。');
        } else if (error.code === 10062) {
            console.error('🔍 找不到指令或應用程式。');
        } else {
            console.error(error.message || error);
        }
        process.exit(1);
    }
}

// 如果直接執行此檔案
if (require.main === module) {
    deleteCommands();
}

module.exports = { deleteCommands }; 