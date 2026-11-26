import { resolve } from 'node:path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: [
      { find: /^@\//, replacement: `${resolve(__dirname, 'src')}/` },
      { find: /^@@\//, replacement: `${resolve(__dirname, 'src')}/` },
      { find: /^~\//, replacement: `${resolve(__dirname, 'src')}/` },
    ],
  },
  test: {
    environment: 'node',
    // Playwright specs (`pnpm e2e`, `pnpm e2e:smoke`, `pnpm e2e:release`) never run under vitest.
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      'tests/release-smoke/**',
      'tests/e2e/**',
      // Git worktrees hold their own checkout of the suite; running them here
      // double-counts tests and reports failures from another branch.
      '.worktrees/**',
    ],
  },
})
