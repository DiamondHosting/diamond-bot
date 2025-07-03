import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import config from './config.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 確保日誌目錄存在
const logDir = path.dirname(config.logging.file);
if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
}

// 日誌級別
const LOG_LEVELS = {
    ERROR: 0,
    WARN: 1,
    INFO: 2,
    DEBUG: 3
};

// 當前日誌級別
const currentLevel = LOG_LEVELS[config.logging.level.toUpperCase()] || LOG_LEVELS.INFO;

// 顏色配置
const colors = {
    reset: '\x1b[0m',
    red: '\x1b[31m',
    yellow: '\x1b[33m',
    green: '\x1b[32m',
    blue: '\x1b[34m',
    magenta: '\x1b[35m',
    cyan: '\x1b[36m',
    white: '\x1b[37m'
};

// 格式化時間
function formatTime() {
    return new Date().toISOString();
}

// 寫入日誌檔案
function writeToFile(level, message, data) {
    try {
        const logEntry = {
            timestamp: formatTime(),
            level: level.toUpperCase(),
            message,
            data: data ? JSON.stringify(data, null, 2) : undefined
        };

        const logLine = JSON.stringify(logEntry) + '\n';
        fs.appendFileSync(config.logging.file, logLine);
    } catch (error) {
        console.error('❌ 寫入日誌檔案失敗：', error.message);
    }
}

// 輸出到控制台
function logToConsole(level, message, color, emoji) {
    const timestamp = formatTime();
    const prefix = `${emoji} [${timestamp}] [${level.toUpperCase()}]`;
    
    if (config.app.isDevelopment) {
        console.log(`${color}${prefix}${colors.reset} ${message}`);
    } else {
        console.log(`${prefix} ${message}`);
    }
}

// 基礎日誌函數
function log(level, message, data) {
    const levelValue = LOG_LEVELS[level.toUpperCase()];
    if (levelValue > currentLevel) return;

    // 寫入檔案
    writeToFile(level, message, data);

    // 輸出到控制台
    switch (level.toUpperCase()) {
        case 'ERROR':
            logToConsole(level, message, colors.red, '❌');
            if (data) console.error(data);
            break;
        case 'WARN':
            logToConsole(level, message, colors.yellow, '⚠️');
            if (data) console.warn(data);
            break;
        case 'INFO':
            logToConsole(level, message, colors.green, 'ℹ️');
            if (data) console.info(data);
            break;
        case 'DEBUG':
            logToConsole(level, message, colors.cyan, '🐛');
            if (data) console.debug(data);
            break;
        default:
            logToConsole(level, message, colors.white, '📝');
            if (data) console.log(data);
    }
}

// 清理舊日誌檔案
function cleanupLogs() {
    try {
        const files = fs.readdirSync(logDir);
        const logFiles = files
            .filter(file => file.endsWith('.log'))
            .map(file => ({
                name: file,
                path: path.join(logDir, file),
                time: fs.statSync(path.join(logDir, file)).mtime.getTime()
            }))
            .sort((a, b) => b.time - a.time);

        // 保留最近 7 天的日誌
        const sevenDaysAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
        logFiles
            .filter(file => file.time < sevenDaysAgo)
            .forEach(file => {
                try {
                    fs.unlinkSync(file.path);
                    log('INFO', `已刪除舊日誌檔案：${file.name}`);
                } catch (error) {
                    log('ERROR', `刪除日誌檔案失敗：${file.name}`, error);
                }
            });
    } catch (error) {
        log('ERROR', '清理日誌檔案時發生錯誤', error);
    }
}

// 定期清理日誌（每日執行）
setInterval(cleanupLogs, 24 * 60 * 60 * 1000);

// 導出日誌函數
const logger = {
    error: (message, data) => log('ERROR', message, data),
    warn: (message, data) => log('WARN', message, data),
    info: (message, data) => log('INFO', message, data),
    debug: (message, data) => log('DEBUG', message, data),
    
    // 特殊用途的日誌函數
    command: (commandName, user, guild) => {
        log('INFO', `指令執行：${commandName}`, {
            user: user.tag,
            userId: user.id,
            guild: guild?.name,
            guildId: guild?.id
        });
    },
    
    interaction: (type, user, guild) => {
        log('DEBUG', `互動事件：${type}`, {
            user: user.tag,
            userId: user.id,
            guild: guild?.name,
            guildId: guild?.id
        });
    },
    
    database: (operation, table, result) => {
        log('DEBUG', `資料庫操作：${operation} on ${table}`, result);
    },
    
    security: (event, user, details) => {
        log('WARN', `安全事件：${event}`, {
            user: user.tag,
            userId: user.id,
            details
        });
    }
};

export default logger;
