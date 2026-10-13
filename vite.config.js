import { defineConfig } from 'vite';

// GitHub Pages 的網址是 https://<帳號>.github.io/cocoanonymous-chat/，
// 所以打包後的檔案路徑要以 /cocoanonymous-chat/ 開頭。
export default defineConfig({
  base: '/cocoanonymous-chat/',
});
