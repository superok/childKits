# 給 Claude 的專案說明

## 發布

- 網站是 GitHub Pages，從 **`claude/ipad-kids-quiz-app-dundi0`** 分支發布（repo 的預設分支）：
  https://superok.github.io/childKits/
- **擁有者的指示：改好的東西都直接推到發布分支**，讓網站馬上更新，不用開 PR。
  - 平常在 session 指定的工作分支上開發、推送，再把同一批 commit 推到發布分支：
    `git fetch origin claude/ipad-kids-quiz-app-dundi0`，確認它是目前 HEAD 的祖先
    （`git merge-base --is-ancestor origin/claude/ipad-kids-quiz-app-dundi0 HEAD`），
    然後 `git push origin HEAD:claude/ipad-kids-quiz-app-dundi0`。
  - 只做快轉（fast-forward）。發布分支有工作分支沒有的 commit 時，先把它合併進來再推；
    絕對不要 force push 發布分支。
- 每次發布都要**同時**把 `js/app.js` 的 `APP_VERSION` 和 `sw.js` 的 `CACHE` 版本號加一，
  不然 iPad 上的離線快取不會換新，首頁也看不出有沒有更新。
- 推完約一兩分鐘 Pages 會重新部署，可以用
  `curl -s https://superok.github.io/childKits/js/app.js | grep APP_VERSION` 確認。
