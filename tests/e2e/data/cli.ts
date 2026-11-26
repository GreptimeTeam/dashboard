/** `pnpm e2e:seed [--force]` — build / verify the fixed e2e database and exit. */

/**
 * `seed` is imported dynamically: the environment guards in `../env` run at module load, and a
 * rejected `E2E_DB` should print one actionable line instead of an import stack trace.
 */
async function main(): Promise<void> {
  const { default: ensureSeed } = await import('./seed')
  const result = await ensureSeed({ force: process.argv.includes('--force') })
  const state = result.seeded ? 'seeded' : 'up to date'
  console.log(
    `[e2e] ${result.database} ${state} (dataset ${result.version}, flow ${result.flow ? 'ok' : 'unavailable'}, ${
      result.ms
    }ms)`
  )
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
