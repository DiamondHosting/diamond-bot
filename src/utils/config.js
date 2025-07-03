import dotenv from 'dotenv';

dotenv.config();

const config = {
    // Discord 配置
    discord: {
        token: process.env.TOKEN,
        clientId: process.env.CLIENT_ID,
        guildId: process.env.GUILD_ID,
        prefix: process.env.BOT_PREFIX || '!',
        status: process.env.BOT_STATUS || 'online',
        activity: process.env.BOT_ACTIVITY || '鑽石託管服務'
    },

    // 資料庫配置
    database: {
        backupInterval: parseInt(process.env.DB_BACKUP_INTERVAL) || 6,
        maxBackupCount: parseInt(process.env.MAX_BACKUP_COUNT) || 7
    },

    // 功能開關
    features: {
        voice: process.env.ENABLE_VOICE === 'true',
        giveaways: process.env.ENABLE_GIVEAWAYS === 'true',
        polls: process.env.ENABLE_POLLS === 'true',
        music: process.env.ENABLE_MUSIC === 'true'
    },

    // 速率限制
    rateLimit: {
        commandCooldown: parseInt(process.env.COMMAND_COOLDOWN) || 3000,
        maxCommandsPerMinute: parseInt(process.env.MAX_COMMANDS_PER_MINUTE) || 20
    },

    // 安全性配置
    security: {
        adminUsers: process.env.ADMIN_USER_IDS?.split(',') || [],
        moderatorRoles: process.env.MODERATOR_ROLE_IDS?.split(',') || []
    },

    // 日誌配置
    logging: {
        level: process.env.LOG_LEVEL || 'info',
        file: process.env.LOG_FILE || 'logs/bot.log'
    },

    // 應用程式配置
    app: {
        environment: process.env.NODE_ENV || 'production',
        isDevelopment: process.env.NODE_ENV === 'development',
        isProduction: process.env.NODE_ENV === 'production'
    }
};

// 驗證必要的配置
function validateConfig() {
    const errors = [];

    if (!config.discord.token) {
        errors.push('缺少 Discord Bot Token (TOKEN)');
    }

    if (!config.discord.clientId) {
        errors.push('缺少 Discord Client ID (CLIENT_ID)');
    }

    if (errors.length > 0) {
        console.error('❌ 配置驗證失敗：');
        errors.forEach(error => console.error(`  - ${error}`));
        process.exit(1);
    }

    console.log('✅ 配置驗證通過');
}

// 顯示配置資訊
function displayConfig() {
    if (config.app.isDevelopment) {
        console.log('📋 當前配置：');
        console.log(`  環境：${config.app.environment}`);
        console.log(`  功能：${Object.entries(config.features).filter(([, enabled]) => enabled).map(([name]) => name).join(', ')}`);
        console.log(`  指令冷卻：${config.rateLimit.commandCooldown}ms`);
        console.log(`  備份間隔：每 ${config.database.backupInterval} 小時`);
    }
}

export {
    config as default,
    validateConfig,
    displayConfig
};
