import { mergeConfig } from 'vite'
import baseConfig from './vite.config.base'

// Do not put vite-plugin-eslint (or any sync linter) in the Vite transform pipeline.
// On save, half-written / parse-failing files make ESLint reject → this.error() aborts
// the module transform → HMR leaves a white screen until the next successful save.
// Lint via IDE / `npx eslint` / CI instead.
export default mergeConfig(
  {
    mode: 'development',
    server: {
      // Clearer signal when a module fails to hot-reload
      hmr: {
        overlay: true,
      },
    },
  },
  baseConfig
)
