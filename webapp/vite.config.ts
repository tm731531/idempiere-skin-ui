import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'
import { resolve } from 'path'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // 載入環境變數
  const env = loadEnv(mode, process.cwd(), '')

  return {
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
      // 部署後不需要 proxy，因為前端跟 API 在同一台伺服器
      proxy: {
        '/api': {
          target: env.VITE_API_URL || 'http://localhost:8080',
          changeOrigin: true,
        },
      },
    },
  }
})
