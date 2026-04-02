
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: './', // Xserverなどの共有サーバーで必須の設定
  define: {
    // process.env.GEMINI_API_KEY を直接定義してビルドエラーを回避
    'process.env.GEMINI_API_KEY': JSON.stringify(process.env.GEMINI_API_KEY || '')
  },
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    emptyOutDir: false, // Windowsでのファイルロック回避のため自動消去を無効化
    rollupOptions: {
      output: {
        manualChunks: undefined
      }
    }
  }
});
