import { resolve } from 'path'
import { defineConfig, type Plugin } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueJsx from '@vitejs/plugin-vue-jsx'
import react from '@vitejs/plugin-react'
import svgLoader from 'vite-svg-loader'
import Components from 'unplugin-vue-components/vite'
import AutoImport from 'unplugin-auto-import/vite'
import { createHtmlPlugin } from 'vite-plugin-html'
import { transformSync } from 'esbuild'
import {
  patchEchartsTooltipGetSize,
  patchEchartsTooltipGetSizeEsbuild,
} from '../src/perses-dashboard/vendor/patchEchartsTooltip'

const tsxTransformer = () => ({
  name: 'tsx-transformer',
  enforce: 'pre' as const,
  transform(code: string, id: string) {
    if (id.includes('.tsx') && !id.includes('node_modules')) {
      const result = transformSync(code, {
        loader: 'tsx',
        jsx: 'automatic',
        target: 'esnext',
        format: 'esm',
        sourcemap: false,
      })
      let sourceMap: string | null = null
      if (result.map && typeof result.map === 'string' && result.map.trim().length > 0) {
        try {
          JSON.parse(result.map)
          sourceMap = result.map
        } catch {
          sourceMap = null
        }
      }
      return {
        code: result.code,
        map: sourceMap,
      }
    }
    return null
  },
})

/** @perses-dev/logs-table-plugin@0.3.0 ships LogRow imports for ./ansiColors.css but omits the file. */
const persesLogsAnsiColorsStub = resolve(__dirname, '../src/perses-dashboard/vendor/logs-table-ansiColors.css')

function stubPersesLogsAnsiColors(): Plugin {
  return {
    name: 'stub-perses-logs-ansi-colors',
    enforce: 'pre',
    resolveId(id, importer) {
      if (!id.includes('ansiColors.css')) return null
      if (importer && importer.includes('@perses-dev/logs-table-plugin')) {
        return persesLogsAnsiColorsStub
      }
      if (id === './ansiColors.css' || id.endsWith('/ansiColors.css')) {
        return persesLogsAnsiColorsStub
      }
      return null
    },
  }
}

/** esbuild (optimizeDeps) does not run Vite resolveId; mirror the stub there. */
function stubPersesLogsAnsiColorsEsbuild() {
  return {
    name: 'stub-perses-logs-ansi-colors-esbuild',
    setup(build: { onResolve: (opts: { filter: RegExp }, cb: () => { path: string }) => void }) {
      build.onResolve({ filter: /ansiColors\.css$/ }, () => ({
        path: persesLogsAnsiColorsStub,
      }))
    },
  }
}

const useDevMode = true
export default defineConfig({
  clearScreen: false,
  envPrefix: ['VITE_', 'TAURI_'],
  server: {
    cors: true,
    open: true,
    fs: {
      strict: true,
    },
    port: 5177,
    strictPort: true,
    proxy: {
      '/v1': {
        target: 'http://127.0.0.1:4000',
        changeOrigin: true,
      },
    },
  },
  preview: {
    port: 5178,
    proxy: {
      '/v1': {
        target: 'http://127.0.0.1:4000',
        changeOrigin: true,
      },
    },
  },
  plugins: [
    patchEchartsTooltipGetSize(),
    stubPersesLogsAnsiColors(),
    tsxTransformer(),
    vue(),
    vueJsx(),
    react({
      include: [/\.tsx$/],
    }),
    createHtmlPlugin({
      minify: true,
      pages: [
        {
          entry: '/src/main.ts',
          filename: 'index.html',
          template: 'index.html',
        },
        {
          entry: '/src/dashboard-main.tsx',
          filename: 'dashboard.html',
          template: 'dashboard.html',
        },
      ],
    }),
    svgLoader({ svgoConfig: {} }),
    AutoImport({
      dts: true,
      eslintrc: {
        enabled: true,
      },
      imports: ['vue', 'pinia', 'vue-router'],
      dirs: ['src/store', 'src/hooks'],
      exclude: [/src\/perses-dashboard\/react\//, /src\/dashboard-main\.tsx/],
    }),
    Components({
      dts: true,
      dirs: ['src/components', 'src/views'],
      extensions: ['vue', 'arco-design'],
      exclude: [/src\/perses-dashboard\/react\//, /src\/dashboard-main\.tsx/],
    }),
  ],
  resolve: {
    alias: [
      {
        find: '@',
        replacement: resolve(__dirname, '../src'),
      },
      {
        find: 'assets',
        replacement: resolve(__dirname, '../src/assets'),
      },
      {
        find: 'vue-i18n',
        replacement: 'vue-i18n/dist/vue-i18n.cjs.js', // Resolve the i18n warning issue
      },
      {
        find: 'hoist-non-react-statics',
        replacement: resolve(__dirname, '../src/perses-dashboard/vendor/hoist-non-react-statics'),
      },
      {
        find: 'react-is',
        replacement: resolve(__dirname, '../src/perses-dashboard/vendor/react-is'),
      },
      {
        find: 'vue',
        replacement: 'vue/dist/vue.esm-bundler.js', // compile template
      },
    ],
    extensions: ['.ts', '.js', '.tsx', '.jsx'],
  },
  define: {
    'process.env': {},
  },
  optimizeDeps: {
    include: [
      'react',
      'react-dom',
      'react-router-dom',
      '@mui/material',
      '@emotion/react',
      '@emotion/styled',
      '@perses-dev/components',
      '@perses-dev/core',
    ],
    esbuildOptions: {
      target: 'esnext',
      plugins: [stubPersesLogsAnsiColorsEsbuild(), patchEchartsTooltipGetSizeEsbuild()],
    },
  },
  css: {
    preprocessorOptions: {
      less: {
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
