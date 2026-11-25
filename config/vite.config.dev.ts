import { mergeConfig } from 'vite'
import baseConfig from './vite.config.base'
import devRecoveryPlugin from './plugin/dev-recovery'

// Do not put vite-plugin-eslint (or any sync linter) in the Vite transform pipeline.
// On save, half-written / parse-failing files make ESLint reject → this.error() aborts
// the module transform → HMR leaves a white screen until the next successful save.
// Lint via IDE / `npx eslint` / CI instead.
export default mergeConfig(
  {
    mode: 'development',
    plugins: [devRecoveryPlugin()],
    server: {
      // Clearer signal when a module fails to hot-reload
      hmr: {
        overlay: true,
      },
      watch: {
        // The repo root holds a 1.1GB git worktree plus build/artifact dirs.
        // Watching them costs file descriptors and fires HMR events for files
        // that are not part of this app. Defaults only ignore node_modules and
        // .git, and `ignored` replaces rather than extends them, so repeat both.
        ignored: [
          '**/.git/**',
          '**/node_modules/**',
          '**/.worktrees/**',
          '**/dist/**',
          '**/.pnpm-store/**',
          '**/.pnpm-store-virtual/**',
          '**/artifacts/**',
          '**/test-results/**',
          '**/playwright-report/**',
        ],
      },
    },
  },
  baseConfig
)
