# 🎈 小小問答樂園

給小朋友玩的 iPad 選擇題問答遊戲（PWA，純前端、可離線、免登入）。

## 功能

- **7 種題型**：認知圖像（動物/水果/交通工具…）、顏色、形狀、數數、加減、英文單字、生活情境（交通安全、危險辨識、禮貌、衛生…）
- **一輪 10 題**：每題有圖像、文字、語音朗讀（中文題中文語音、英文題英文語音）、2~4 個選項
- **多位玩家**：首頁大頭像一點就切換，每人可設定自己的名字、頭像、代表色、難度、題型
- **輪流對戰**：一人一題輪流答，整個畫面會變成當前玩家的代表色 + 大頭像 + 語音提示「換○○囉！」
- **排行榜**：每人前 10 名最佳成績 + 對戰勝負紀錄（存在本機 localStorage）
- **答錯有教學**：情境題答錯時會用語音解釋為什麼

## 怎麼跑起來

這是純靜態網站，不需要安裝任何東西，但**要用 HTTP 伺服器開**（直接點開 index.html 會載入不了題庫）：

```bash
# 本機測試
cd childKits
python3 -m http.server 8000
# 打開 http://localhost:8000
```

### 部署給 iPad 用（建議：GitHub Pages）

1. GitHub repo → Settings → Pages → Source 選這個分支、目錄選 `/ (root)`
2. 等網址生效後，用 iPad 的 Safari 打開
3. 點分享按鈕 → **加入主畫面**
4. 之後從主畫面圖示開啟，就是全螢幕、可離線的 app

## 資料檔

- `data/situations.json` — 情境題庫（50 題），格式與加題方式見 `data/README.md`
- `data/vocab.json` — 認知／英文題的詞彙庫（中文、英文、emoji）

## 專案結構

```
index.html          # 單頁 app（所有畫面）
css/styles.css      # 樣式
js/storage.js       # 玩家檔案/成績/對戰紀錄（localStorage）
js/audio.js         # 音效（WebAudio）與語音朗讀（SpeechSynthesis）
js/generators.js    # 各題型的題目產生器
js/app.js           # 畫面流程與遊戲邏輯
data/               # 題庫與詞彙資料
sw.js               # Service Worker 離線快取
manifest.webmanifest
```

規格文件見 [REQUIREMENTS.md](REQUIREMENTS.md)。
