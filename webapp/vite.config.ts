import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { resolve } from 'path'

// https://vite.dev/config/
export default defineConfig({
  plugins: [vue()],

  // OSGi 部署路徑 - 這是關鍵設定！
  base: '/ui/',

  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },

  build: {
    // 輸出到 OSGi bundle 的 web 目錄
    outDir: '../osgi-bundle/web',
    emptyOutDir: true,

    // 代碼混淆設定
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: true,
        drop_debugger: true,
      },
      mangle: {
        toplevel: true,
      },
      format: {
        comments: false,
      },
    },

    // 分割 chunks
    rollupOptions: {
      output: {
        manualChunks: {
          'vue-vendor': ['vue', 'vue-router', 'pinia'],
        },
      },
    },
  },

  server: {
    // 開發時代理 API 請求到 iDempiere
    proxy: {
      '/api': {
        target: 'http://192.168.0.48:8080',
        changeOrigin: true,
      },
    },
  },
})
