# 升級指南 v1.0 → v2.0

## 🎯 升級完成摘要

你的 Discord Bot 已成功升級到最新版本！以下是完成的主要改進：

### 🚀 架構升級

1. **ES Modules 轉換**
   - 從 CommonJS (`require`/`module.exports`) 轉換為 ES Modules (`import`/`export`)
   - 所有檔案都已更新為使用新的模組語法

2. **Node.js 版本要求**
   - 最低要求從 Node.js 18+ 升級到 Node.js 20+
   - 利用最新的 Node.js 功能和效能改進

3. **套件更新**
   - Discord.js: 保持 v14.16.3 (最新穩定版)
   - better-sqlite3: v11.3.0 → v11.5.0
   - dotenv: v16.4.5 → v16.4.7
   - 新增 TypeScript 支援相關套件

### 🐛 重要修復

1. **按鈕互動錯誤**
   - ❌ 舊版: `handlePollInfoButton is not defined`
   - ✅ 新版: 完整實作所有按鈕處理函數

2. **資料庫查詢錯誤**
   - ❌ 舊版: `Poll.find is not a function`
   - ✅ 新版: 添加完整的查詢方法

3. **抽獎功能錯誤**
   - ❌ 舊版: `handleJoinGiveaway is not defined`
   - ✅ 新版: 完整的抽獎互動功能

### 📦 套件更新詳情

```json
{
  "dependencies": {
    "@discordjs/voice": "^0.17.0",
    "better-sqlite3": "^11.5.0",
    "discord.js": "^14.16.3", 
    "dotenv": "^16.4.7",
    "node-cron": "^3.0.3",
    "play-dl": "^1.9.7",
    "ytdl-core": "^4.11.5"
  },
  "devDependencies": {
    "@types/better-sqlite3": "^7.6.11",
    "@types/node": "^22.8.7",
    "@types/node-cron": "^3.0.11",
    "nodemon": "^3.1.7",
    "typescript": "^5.6.3"
  }
}
```

### 🔧 TypeScript 配置更新

- 目標版本升級到 ES2023
- 模組系統改為 Node16 以支援 ES Modules
- 新增 `verbatimModuleSyntax` 選項以嚴格模組語法

### 📁 檔案更改

#### 主要檔案
- `src/index.js` - 轉換為 ES Modules，重構為異步主函式
- `src/deploy-commands.js` - 完全重寫以支援 ES Modules
- `src/delete-commands.js` - 轉換為 ES Modules

#### 工具檔案
- `src/utils/database.js` - 轉換為 ES Modules
- `src/utils/config.js` - 轉換為 ES Modules 
- `src/utils/logger.js` - 轉換為 ES Modules

#### 模型檔案
- `src/models/Poll.js` - 轉換為 ES Modules
- `src/models/Giveaway.js` - 轉換為 ES Modules

#### 事件檔案
- `src/events/interactionCreate.js` - 轉換為 ES Modules
- `src/events/voiceStateUpdate.js` - 轉換為 ES Modules

#### 指令檔案
- `src/commands/poll/poll.js` - 轉換為 ES Modules
- `src/commands/poll/list.js` - 轉換為 ES Modules
- `src/commands/giveaway/giveaway.js` - 轉換為 ES Modules
- `src/commands/tempvoice/tempvoice.js` - 轉換為 ES Modules
- `src/commands/voice/voice.js` - 轉換為 ES Modules

## 🔄 移轉步驟

1. **備份現有專案**
   ```bash
   cp -r diamond-bot diamond-bot-backup
   ```

2. **安裝新依賴**
   ```bash
   npm install
   ```

3. **修復安全性問題**
   ```bash
   npm audit fix
   ```

4. **測試語法**
   ```bash
   node --check src/index.js
   node --check src/deploy-commands.js
   ```

5. **部署指令（如需要）**
   ```bash
   npm run deploy
   ```

6. **啟動機器人**
   ```bash
   npm start
   ```

## ⚠️ 注意事項

1. **向後相容性**
   - 所有 Discord 功能保持不變
   - 資料庫結構未更改
   - 指令介面保持一致

2. **開發環境**
   - 確保使用 Node.js 20+ 版本
   - VSCode 使用者可能需要重新載入 TypeScript 服務

3. **部署注意**
   - 生產環境需要先測試
   - 建議在測試伺服器先驗證

## 🎯 優勢

- **更好的效能**: 利用最新 Node.js 功能
- **更清晰的程式碼**: ES Modules 提供更好的模組化
- **TypeScript 支援**: 更好的開發體驗和類型安全
- **未來準備**: 為未來升級做好準備
- **安全性**: 修復已知安全性問題

## 🔍 驗證升級

升級完成後，請執行以下檢查：

1. ✅ 機器人可以正常啟動
2. ✅ 所有指令可以正常執行
3. ✅ 資料庫功能正常
4. ✅ 沒有控制台錯誤
5. ✅ 所有功能按預期工作

如有任何問題，請參考日誌檔案或回滾到備份版本。
