# 🤖 Diamond Bot - 鑽石機器人 v2.0

一個功能豐富的 Discord 機器人，提供投票、抽獎、語音功能等多種服務。

## ✨ 功能特色

- 🗳️ **投票系統** - 建立多選投票，支援時間限制和權限控制
- 🎉 **抽獎系統** - 舉辦抽獎活動，自動選出得獎者
- 🎵 **音樂播放** - 播放 YouTube 音樂和播放清單
- 🔊 **語音管理** - 臨時語音頻道管理
- 📊 **資料統計** - 詳細的使用統計和分析
- 🛡️ **權限控制** - 細緻的權限管理系統

## 🚀 快速開始

### 環境需求

- Node.js >= 20.0.0
- npm 或 yarn
- Discord Bot Token

### 安裝步驟

1. **克隆專案**
```bash
git clone <repository-url>
cd diamond-bot
```

2. **安裝依賴**
```bash
npm install
```

3. **設定環境變數**
```bash
cp .env.example .env
```
編輯 `.env` 檔案，填入你的 Discord Bot 資訊：
```env
TOKEN=your_discord_bot_token
CLIENT_ID=your_bot_client_id
GUILD_ID=your_server_id
```

4. **部署指令**
```bash
npm run deploy
```

5. **啟動機器人**
```bash
npm start
```

### 開發模式

```bash
npm run dev
```

## �️ 技術棧

- **Runtime**: Node.js 20+ with ES Modules
- **Framework**: Discord.js v14.16.3
- **Database**: better-sqlite3 v11.5.0
- **Language**: JavaScript/TypeScript
- **Package Manager**: npm
- **Development**: nodemon for hot reload

## �📋 可用指令

### 投票相關
- `/投票 發起` - 建立新投票
- `/投票列表` - 查看進行中的投票

### 抽獎相關
- `/抽獎 發起` - 建立新抽獎活動

### 語音相關
- `/tempvoice` - 管理臨時語音頻道
- `/voice` - 語音功能控制

## 🏗️ 專案結構

```
diamond-bot/
├── src/
│   ├── commands/          # 指令檔案
│   │   ├── giveaway/     # 抽獎相關指令
│   │   ├── poll/         # 投票相關指令
│   │   ├── tempvoice/    # 臨時語音指令
│   │   └── voice/        # 語音指令
│   ├── events/           # 事件處理器
│   ├── models/           # 資料模型
│   ├── utils/            # 工具函數
│   ├── index.js          # 主程式
│   ├── deploy-commands.js # 指令部署
│   └── delete-commands.js # 指令刪除
├── data/                 # 資料檔案
│   ├── database/         # SQLite 資料庫
│   └── backups/          # 資料庫備份
├── package.json
├── tsconfig.json
├── .env.example
└── README.md
```

## 🔧 配置選項

### 環境變數

| 變數名 | 描述 | 預設值 |
|--------|------|--------|
| `TOKEN` | Discord Bot Token | 必填 |
| `CLIENT_ID` | Discord 應用程式 ID | 必填 |
| `GUILD_ID` | Discord 伺服器 ID | 選填 |
| `NODE_ENV` | 執行環境 | `production` |
| `DB_BACKUP_INTERVAL` | 備份間隔（小時） | `6` |
| `MAX_BACKUP_COUNT` | 最大備份數量 | `7` |

### 功能開關

可在 `.env` 檔案中控制功能的開啟與關閉：

```env
ENABLE_VOICE=true
ENABLE_GIVEAWAYS=true
ENABLE_POLLS=true
ENABLE_MUSIC=true
```

## 📚 API 文件

### 資料庫模型

#### Poll 模型
```javascript
{
  id: String,           // 投票 ID
  question: String,     // 投票問題
  options: Array,       // 選項列表
  votes: Object,        // 投票記錄
  end_time: Number,     // 結束時間
  is_ended: Boolean,    // 是否已結束
  max_choices: Number,  // 最大選擇數
  restrict_role: String // 限制身分組
}
```

#### Giveaway 模型
```javascript
{
  id: String,           // 抽獎 ID
  prize: String,        // 獎品
  winners_count: Number,// 得獎人數
  participants: Array,  // 參與者列表
  end_time: Number,     // 結束時間
  is_ended: Boolean,    // 是否已結束
  role_requirement: String // 身分組要求
}
```

## 🛠️ 開發指南

### 新增指令

1. 在對應的 `commands/` 子資料夾中建立新檔案
2. 使用以下範本：

```javascript
const { SlashCommandBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('指令名稱')
        .setDescription('指令描述'),
    
    async execute(interaction) {
        // 指令邏輯
        await interaction.reply('回應內容');
    }
};
```

3. 重新部署指令：`npm run deploy`

### 新增事件處理器

1. 在 `events/` 資料夾中建立新檔案
2. 使用以下範本：

```javascript
module.exports = {
    name: '事件名稱',
    once: false, // 是否只執行一次
    async execute(...args) {
        // 事件處理邏輯
    }
};
```

### 資料庫操作

使用 better-sqlite3 進行資料庫操作：

```javascript
const { db } = require('../utils/database');

// 查詢
const result = db.prepare('SELECT * FROM polls WHERE id = ?').get(pollId);

// 插入
db.prepare('INSERT INTO polls (...) VALUES (...)').run(...values);

// 更新
db.prepare('UPDATE polls SET ... WHERE id = ?').run(...values, pollId);

// 刪除
db.prepare('DELETE FROM polls WHERE id = ?').run(pollId);
```

## 🔒 安全性

- 使用環境變數儲存敏感資訊
- 實施指令冷卻時間
- 權限驗證機制
- 輸入驗證和清理
- 定期資料庫備份

## 📊 監控與日誌

- 自動錯誤捕獲和記錄
- 效能監控
- 使用統計
- 資料庫備份狀態

## 🤝 貢獻

歡迎提交 Issues 和 Pull Requests！

### 開發流程

1. Fork 此專案
2. 建立功能分支 (`git checkout -b feature/新功能`)
3. 提交變更 (`git commit -am '新增新功能'`)
4. 推送分支 (`git push origin feature/新功能`)
5. 建立 Pull Request

## 📄 授權

此專案採用 MIT 授權條款 - 詳見 [LICENSE](LICENSE) 檔案

## 🆘 支援

如果遇到問題，請：

1. 查看 [常見問題](#常見問題)
2. 搜尋 [Issues](../../issues)
3. 建立新的 Issue

## 📝 更新日誌

### v1.0.0 (2025-01-03)
- 🎉 初始版本發布
- ✨ 新增投票系統
- ✨ 新增抽獎系統
- ✨ 新增語音管理功能
- 🛡️ 新增權限控制系統
- 📊 新增資料庫備份機制

## 🔄 升級到 v2.0

此版本包含重大架構升級：

- ✅ **ES Modules**: 完全轉換為現代 ES Modules 語法
- ✅ **Node.js 20+**: 升級最低版本要求以利用最新功能
- ✅ **TypeScript 支援**: 新增完整的 TypeScript 開發支援
- ✅ **套件更新**: 所有依賴套件升級到最新穩定版本
- ✅ **安全性修復**: 修復已知的安全性問題

詳細升級指南請參考 [UPGRADE.md](./UPGRADE.md)

## ❓ 常見問題

### Q: 機器人無法回應指令？
A: 請確認：
1. Bot Token 是否正確
2. 機器人是否有足夠的權限
3. 指令是否已正確部署

### Q: 資料庫錯誤？
A: 請檢查：
1. 資料庫檔案權限
2. 磁碟空間是否足夠
3. 查看錯誤日誌

### Q: 如何更新機器人？
A: 
1. 備份現有資料
2. 拉取最新程式碼
3. 執行 `npm install`
4. 重新部署指令
5. 重啟機器人

---

Made with ❤️ by Diamond Team
