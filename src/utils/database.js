const Database = require('better-sqlite3')
const path = require('path')
const fs = require('fs')

const DATA_DIR = path.join(process.cwd(), 'data')
const DATABASE_DIR = path.join(DATA_DIR, 'database')
const BACKUP_DIR = path.join(DATA_DIR, 'backups')

[DATA_DIR, DATABASE_DIR, BACKUP_DIR].forEach(dir => {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true })
    }
})

const DB_PATH = path.join(DATABASE_DIR, 'diamond_bot.db')

const db = new Database(DB_PATH)

function backupDatabase() {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
    const backupPath = path.join(BACKUP_DIR, `backup-${timestamp}.db`)
    try {
        db.backup(backupPath)
            .then(() => {
                console.log(`✅ 資料庫備份成功：${backupPath}`)
                const files = fs.readdirSync(BACKUP_DIR)
                const backupFiles = files
                    .filter(file => file.startsWith('backup-'))
                    .map(file => ({
                        name: file,
                        path: path.join(BACKUP_DIR, file),
                        time: fs.statSync(path.join(BACKUP_DIR, file)).mtime.getTime()
                    }))
                    .sort((a, b) => b.time - a.time)
                backupFiles.slice(7).forEach(file => {
                    fs.unlinkSync(file.path)
                    console.log(`🗑️ 已刪除舊備份：${file.name}`)
                })
            })
            .catch(err => {
                console.error('❌ 備份失敗：', err)
            })
    } catch (error) {
        console.error('❌ 備份過程發生錯誤：', error)
    }
}

function initializeDatabase() {
    console.log('📦 正在初始化資料庫...')
    db.prepare(`DROP TABLE IF EXISTS polls`).run()
    db.prepare(`
        CREATE TABLE IF NOT EXISTS polls (
            id TEXT PRIMARY KEY,
            question TEXT NOT NULL,
            description TEXT,
            options TEXT NOT NULL,
            votes TEXT NOT NULL,
            channel_id TEXT NOT NULL,
            message_id TEXT NOT NULL,
            guild_id TEXT NOT NULL,
            host_id TEXT NOT NULL,
            created_at INTEGER NOT NULL,
            end_time INTEGER,
            is_ended INTEGER DEFAULT 0,
            is_public INTEGER DEFAULT 1,
            max_choices INTEGER DEFAULT 1,
            restrict_role TEXT,
            cover_image TEXT
        )
    `).run()
    db.prepare(`
        CREATE TABLE IF NOT EXISTS giveaways (
            id TEXT PRIMARY KEY,
            prize TEXT NOT NULL,
            description TEXT,
            winners_count INTEGER NOT NULL,
            channel_id TEXT NOT NULL,
            message_id TEXT NOT NULL,
            guild_id TEXT NOT NULL,
            host_id TEXT NOT NULL,
            role_requirement TEXT,
            participants TEXT DEFAULT '[]',
            created_at INTEGER NOT NULL,
            end_time INTEGER NOT NULL,
            is_ended INTEGER DEFAULT 0
        )
    `).run()
    db.prepare(`
        CREATE TABLE IF NOT EXISTS giveaway_participants (
            giveaway_id TEXT NOT NULL,
            user_id TEXT NOT NULL,
            joined_at INTEGER NOT NULL DEFAULT (unixepoch()),
            PRIMARY KEY (giveaway_id, user_id),
            FOREIGN KEY (giveaway_id) REFERENCES giveaways(id) ON DELETE CASCADE
        )
    `).run()
    db.prepare(`
        CREATE TABLE IF NOT EXISTS playlists (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            songs TEXT DEFAULT '[]',
            user_id TEXT NOT NULL,
            guild_id TEXT NOT NULL,
            created_at INTEGER NOT NULL
        )
    `).run()
    db.prepare(`
        CREATE TABLE IF NOT EXISTS giveaway_winners (
            giveaway_id TEXT NOT NULL,
            user_id TEXT NOT NULL,
            won_at INTEGER NOT NULL,
            PRIMARY KEY (giveaway_id, user_id),
            FOREIGN KEY (giveaway_id) REFERENCES giveaways(id) ON DELETE CASCADE
        )
    `).run()
    console.log('✅ 資料庫初始化完成！')
}

setInterval(backupDatabase, 6 * 60 * 60 * 1000)
backupDatabase()
initializeDatabase()

module.exports = {
    db,
    initializeDatabase,
    backupDatabase
}