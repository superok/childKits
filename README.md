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

- `data/situations.json` — 情境題庫，格式與加題方式見 `data/README.md`
- `data/vocab.json` — 認知／英文題的詞彙庫（中文、英文、emoji）

## 語音架構

題目與回饋用**預錄音檔**（微軟神經網路語音：中文 `zh-TW-HsiaoChenNeural`、英文
`en-US-AnaNeural`，語速 -10%），音質遠優於裝置內建 TTS：

| 目錄 | 內容 |
|---|---|
| `audio/sit/` | 情境題的題目、每個選項、答錯解釋 |
| `audio/word/` | 詞彙：`{類別}-{英文}-q` 哪一個是X？、`-w` X單念、`-eq` Find the X!、`-ew` X英文單念 |
| `audio/count/` | 數數題：「數一數，圖裡有幾X？」 |
| `audio/num/` | 數字 0~55 單念（加減題拼接用） |
| `audio/frag/` | 「加」「減」「等於多少？」等片段 |
| `audio/common/` | 稱讚語、「答錯了喔，正確答案是」 |
| `audio/manifest.json` | 所有音檔清單，app 靠它判斷哪些音檔可用 |

- 檔名帶**類別前綴**是必要的：`orange` 同時是水果和顏色、`star` 同時是自然和形狀。
- 產生器每題會吐出 `audioSeq`（依畫面上的選項順序）、`answerAudio`、`explainAudio`；
  播放前檢查音檔是否齊全，**任何一段缺失或播放失敗就整題退回裝置 TTS**，不會靜默卡住。
- **玩家名字無法預錄**，所以「換○○囉！」「恭喜○○獲勝」仍用裝置 TTS；首頁的
  「🔊 語音設定」就是在調這部分（可選聲音與語速，也可為英文名指定中文唸法）。
- 音檔採「快取優先」，每段只下載一次，之後離線可用。

### 重新生成音檔

改過題庫或詞彙庫後：

```bash
python3 tools/generate_audio.py        # 情境題
python3 tools/generate_audio_words.py  # 詞彙、數字、片段
```

兩個腳本都會跳過已存在的檔案，只補新的。

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
