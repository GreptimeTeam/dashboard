import { resolve } from 'node:path'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import AutoImport from 'unplugin-auto-import/vite'
import Components from 'unplugin-vue-components/vite'

/**
 * Dev-only config for the DataGrid perf harness (`perf.html`).
 *
 * Why a separate config instead of `vite.config.dev.ts`:
 * `createHtmlPlugin` injects `/src/main.ts` into **every** served HTML page, so a
 * standalone `perf.html` cannot mount its own entry under the app config. This
 * config keeps the same aliases + transform plugins (so `.vue`/pug/auto-import
 * behave identically) but drops the app shell.
 *
 * Usage: `pnpm dev:perf` → http://localhost:5180/perf.html?rows=20&cols=40
 */
export default defineConfig({
  root: resolve(__dirname, '..'),
  server: {
    // Bind explicitly: `localhost` may resolve to ::1, while Playwright's webServer
    // probe (and CI) checks 127.0.0.1.
    host: '127.0.0.1',
    port: 5180,
    strictPort: true,
    open: false,
    fs: { strict: true },
  },
  plugins: [
    vue(),
    AutoImport({
      imports: ['vue', 'pinia', 'vue-router'],
      dirs: ['src/store', 'src/hooks'],
      dts: false,
    }),
    Components({
      dirs: ['src/components', 'src/views'],
      dts: false,
    }),
  ],
  resolve: {
    alias: [
      { find: '@', replacement: resolve(__dirname, '../src') },
      { find: 'assets', replacement: resolve(__dirname, '../src/assets') },
      { find: 'vue-i18n', replacement: 'vue-i18n/dist/vue-i18n.cjs.js' },
      { find: 'vue', replacement: 'vue/dist/vue.esm-bundler.js' },
    ],
    extensions: ['.ts', '.js', '.tsx', '.jsx'],
  },
  css: {
    preprocessorOptions: {
      less: {
        // Same Arco token overrides as the app, so the harness looks like production.
        modifyVars: {
          hack: `true; @import (reference) "${resolve(
            'src/assets/style/breakpoint.less'
          )}"; @import (reference) "${resolve('src/assets/style/arco-theme.less')}";`,
        },
        javascriptEnabled: true,
      },
    },
  },
})
