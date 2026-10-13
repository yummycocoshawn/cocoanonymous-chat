# CLAUDE.md

這是一個不用登入的匿名聊天室，前端放在 GitHub Pages，即時傳訊使用 Supabase。

- 開始任何工作前，先讀 `docs/architecture.md`
- 目前在「階段一」：前端搭配假後端（`MockChatService`），尚未接上 Supabase
- 不可以把金鑰檔案（`.env`、`.env.local` 等）commit 進 git；`service_role` 金鑰不可出現在專案的任何地方
