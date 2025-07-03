const { REST, Routes } = require('discord.js');
require('dotenv').config();

async function deleteCommands() {
    try {
        if (!process.env.TOKEN) {
            throw new Error('找不到 Discord Bot Token！請確認 .env 檔案中有設定 TOKEN。');
        }
        if (!process.env.CLIENT_ID) {
            throw new Error('找不到 Client ID！請確認 .env 檔案中有設定 CLIENT_ID。');
        }
        if (!process.env.GUILD_ID) {
            throw new Error('找不到 Guild ID！請確認 .env 檔案中有設定 GUILD_ID。');
        }

        const rest = new REST().setToken(process.env.TOKEN);

        console.log('正在獲取現有的命令...');

        const commands = await rest.get(
            Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID)
        );

        console.log(`找到 ${commands.length} 個命令，開始刪除...`);

        for (const command of commands) {
            await rest.delete(
                Routes.applicationGuildCommand(process.env.CLIENT_ID, process.env.GUILD_ID, command.id)
            );
            console.log(`✅ 已刪除命令：${command.name}`);
        }

        const remainingCommands = await rest.get(
            Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID)
        );

        if (remainingCommands.length === 0) {
            console.log('✅ 所有命令已成功刪除！');
        } else {
            console.log(`⚠️ 警告：仍有 ${remainingCommands.length} 個命令未被刪除`);
        }

    } catch (error) {
        console.error('❌ 刪除命令時發生錯誤：');
        if (error.code === 50001) {
            console.error('缺少權限！請確認機器人有足夠的權限來刪除命令。');
        } else {
            console.error(error);
        }
        process.exit(1);
    }
}

deleteCommands(); 