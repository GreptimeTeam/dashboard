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
    // Playwright release smoke specs run via `pnpm smoke:release`, not vitest.
    exclude: ['**/node_modules/**', '**/dist/**', 'tests/release-smoke/**'],
  },
})
