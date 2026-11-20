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
    // Playwright menu/release smoke specs run via `pnpm smoke:menu` / `smoke:release`, not vitest.
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      'tests/release-smoke/**',
      'tests/menu-smoke/**',
      // Git worktrees hold their own checkout of the suite; running them here
      // double-counts tests and reports failures from another branch.
      '.worktrees/**',
    ],
  },
})
