import Database from 'better-sqlite3';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_DIR = path.join(process.cwd(), 'data');
const DATABASE_DIR = path.join(DATA_DIR, 'database');
const BACKUP_DIR = path.join(DATA_DIR, 'backups');

// 確保目錄存在
[DATA_DIR, DATABASE_DIR, BACKUP_DIR].forEach(dir => {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
        console.log(`📁 已建立目錄：${dir}`);
    }
});

const DB_PATH = path.join(DATABASE_DIR, 'diamond_bot.db');

// 建立資料庫連接，設定更好的配置
const db = new Database(DB_PATH, {
    verbose: process.env.NODE_ENV === 'development' ? console.log : null,
    fileMustExist: false
});

// 設定資料庫 pragma 以提升效能和可靠性
db.pragma('journal_mode = WAL');
db.pragma('synchronous = NORMAL');
db.pragma('cache_size = 1000000');
db.pragma('temp_store = memory');
db.pragma('mmap_size = 268435456'); // 256MB

async function backupDatabase() {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('T')[0];
    const backupPath = path.join(BACKUP_DIR, `backup-${timestamp}.db`);
    
    try {
        // 檢查是否今天已有備份
        if (fs.existsSync(backupPath)) {
            console.log(`📅 今日備份已存在：${backupPath}`);
            return;
        }

        await db.backup(backupPath);
        console.log(`✅ 資料庫備份成功：${backupPath}`);
        
        // 清理舊備份（保留最近 7 天）
        try {
            const files = fs.readdirSync(BACKUP_DIR);
            const backupFiles = files
                .filter(file => file.startsWith('backup-') && file.endsWith('.db'))
                .map(file => ({
                    name: file,
                    path: path.join(BACKUP_DIR, file),
                    time: fs.statSync(path.join(BACKUP_DIR, file)).mtime.getTime()
                }))
                .sort((a, b) => b.time - a.time);
            
            // 刪除超過 7 天的備份
            backupFiles.slice(7).forEach(file => {
                try {
                    fs.unlinkSync(file.path);
                    console.log(`🗑️ 已刪除舊備份：${file.name}`);
                } catch (deleteError) {
                    console.error(`❌ 刪除備份失敗：${file.name}`, deleteError.message);
                }
            });
        } catch (cleanupError) {
            console.error('❌ 清理舊備份時發生錯誤：', cleanupError.message);
        }
    } catch (error) {
        console.error('❌ 備份過程發生錯誤：', error.message);
        throw error;
    }
}

function initializeDatabase() {
    console.log('📦 正在初始化資料庫...');
    
    try {
        // 使用事務確保原子性
        const transaction = db.transaction(() => {
            // 重建 polls 表格
            db.prepare(`DROP TABLE IF EXISTS polls`).run();
            db.prepare(`
                CREATE TABLE polls (
                    id TEXT PRIMARY KEY,
                    question TEXT NOT NULL,
                    description TEXT,
                    options TEXT NOT NULL,
                    votes TEXT NOT NULL DEFAULT '{}',
                    channel_id TEXT NOT NULL,
                    message_id TEXT NOT NULL,
                    guild_id TEXT NOT NULL,
                    host_id TEXT NOT NULL,
                    created_at INTEGER NOT NULL DEFAULT (unixepoch()),
                    end_time INTEGER,
                    is_ended INTEGER DEFAULT 0 CHECK (is_ended IN (0, 1)),
                    is_public INTEGER DEFAULT 1 CHECK (is_public IN (0, 1)),
                    max_choices INTEGER DEFAULT 1 CHECK (max_choices > 0),
                    restrict_role TEXT,
                    cover_image TEXT
                )
            `).run();

            // 建立 giveaways 表格
            db.prepare(`
                CREATE TABLE IF NOT EXISTS giveaways (
                    id TEXT PRIMARY KEY,
                    prize TEXT NOT NULL,
                    description TEXT,
                    winners_count INTEGER NOT NULL CHECK (winners_count > 0),
                    channel_id TEXT NOT NULL,
                    message_id TEXT NOT NULL,
                    guild_id TEXT NOT NULL,
                    host_id TEXT NOT NULL,
                    role_requirement TEXT,
                    participants TEXT DEFAULT '[]',
                    created_at INTEGER NOT NULL DEFAULT (unixepoch()),
                    end_time INTEGER NOT NULL,
                    is_ended INTEGER DEFAULT 0 CHECK (is_ended IN (0, 1))
                )
            `).run();

            // 建立 giveaway_participants 表格
            db.prepare(`
                CREATE TABLE IF NOT EXISTS giveaway_participants (
                    giveaway_id TEXT NOT NULL,
                    user_id TEXT NOT NULL,
                    joined_at INTEGER NOT NULL DEFAULT (unixepoch()),
                    PRIMARY KEY (giveaway_id, user_id),
                    FOREIGN KEY (giveaway_id) REFERENCES giveaways(id) ON DELETE CASCADE
                )
            `).run();

            // 建立 giveaway_winners 表格
            db.prepare(`
                CREATE TABLE IF NOT EXISTS giveaway_winners (
                    giveaway_id TEXT NOT NULL,
                    user_id TEXT NOT NULL,
                    won_at INTEGER NOT NULL DEFAULT (unixepoch()),
                    PRIMARY KEY (giveaway_id, user_id),
                    FOREIGN KEY (giveaway_id) REFERENCES giveaways(id) ON DELETE CASCADE
                )
            `).run();

            // 建立 playlists 表格
            db.prepare(`
                CREATE TABLE IF NOT EXISTS playlists (
                    id TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    songs TEXT DEFAULT '[]',
                    user_id TEXT NOT NULL,
                    guild_id TEXT NOT NULL,
                    created_at INTEGER NOT NULL DEFAULT (unixepoch())
                )
            `).run();

            // 建立 temp_voice_channels 表格
            db.prepare(`
                CREATE TABLE IF NOT EXISTS temp_voice_channels (
                    channel_id TEXT PRIMARY KEY,
                    owner_id TEXT NOT NULL,
                    guild_id TEXT NOT NULL,
                    created_at INTEGER NOT NULL DEFAULT (unixepoch())
                )
            `).run();

            // 建立索引以提升查詢效能
            db.prepare(`CREATE INDEX IF NOT EXISTS idx_polls_guild_ended ON polls(guild_id, is_ended)`).run();
            db.prepare(`CREATE INDEX IF NOT EXISTS idx_polls_end_time ON polls(end_time)`).run();
            db.prepare(`CREATE INDEX IF NOT EXISTS idx_giveaways_guild_ended ON giveaways(guild_id, is_ended)`).run();
            db.prepare(`CREATE INDEX IF NOT EXISTS idx_giveaways_end_time ON giveaways(end_time)`).run();
            db.prepare(`CREATE INDEX IF NOT EXISTS idx_giveaway_participants_giveaway ON giveaway_participants(giveaway_id)`).run();
            db.prepare(`CREATE INDEX IF NOT EXISTS idx_playlists_user_guild ON playlists(user_id, guild_id)`).run();
            db.prepare(`CREATE INDEX IF NOT EXISTS idx_temp_voice_guild ON temp_voice_channels(guild_id)`).run();
        });

        transaction();
        console.log('✅ 資料庫初始化完成！');
    } catch (error) {
        console.error('❌ 資料庫初始化失敗：', error.message);
        throw error;
    }
}

// 優雅關閉資料庫連接
function closeDatabase() {
    try {
        db.close();
        console.log('📦 資料庫連接已關閉');
    } catch (error) {
        console.error('❌ 關閉資料庫時發生錯誤：', error.message);
    }
}

// 設定定期備份（每 6 小時）
const BACKUP_INTERVAL = 6 * 60 * 60 * 1000; // 6 小時
setInterval(() => {
    backupDatabase().catch(error => {
        console.error('❌ 定期備份失敗：', error.message);
    });
}, BACKUP_INTERVAL);

// 監聽程序退出事件
process.on('SIGINT', closeDatabase);
process.on('SIGTERM', closeDatabase);
process.on('exit', closeDatabase);

// 立即執行備份和初始化
// 初始化資料庫
(async () => {
    try {
        await backupDatabase();
        initializeDatabase();
    } catch (error) {
        console.error('❌ 資料庫啟動失敗：', error.message);
        process.exit(1);
    }
})();

export {
    db,
    initializeDatabase,
    backupDatabase,
    closeDatabase
};