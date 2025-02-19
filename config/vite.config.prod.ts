import { mergeConfig } from 'vite'
import Components from 'unplugin-vue-components/vite'
import AutoImport from 'unplugin-auto-import/vite'
import baseConfig from './vite.config.base'
import configCompressPlugin from './plugin/compress'
import configVisualizerPlugin from './plugin/visualizer'
import configArcoResolverPlugin from './plugin/arcoResolver'
import configStyleImportPlugin from './plugin/styleImport'

export default mergeConfig(
  {
    base: '',
    mode: 'production',
    base: './',
    plugins: [
      configCompressPlugin('gzip'),
      configVisualizerPlugin(),
      configArcoResolverPlugin(),
      configStyleImportPlugin(),
    ],
    build: {
      target: process.env.TAURI_PLATFORM === 'windows' ? 'chrome105' : 'safari13',
      minify: !process.env.TAURI_DEBUG ? 'esbuild' : false,
      sourcemap: !!process.env.TAURI_DEBUG,
      rollupOptions: {
        output: {
          manualChunks: {
            arco: ['@arco-design/web-vue'],
            chart: ['echarts', 'vue-echarts'],
            vue: ['vue', 'vue-router', 'pinia', '@vueuse/core', 'vue-i18n'],
          },
        },
        plugins: [
          AutoImport({
            dts: true,
            eslintrc: {
              enabled: true,
            },
            imports: ['vue', 'pinia', 'vue-router'],
            dirs: ['src/store', 'src/hooks'],
          }),
          Components({
            dts: true,
            dirs: ['src/components', 'src/views'],
            extensions: ['vue', 'arco-design'],
          }),
        ],
      },
      chunkSizeWarningLimit: 2000,
    },
  },
  baseConfig
)
