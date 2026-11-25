/** `pnpm e2e:seed [--force]` — build / verify the fixed e2e database and exit. */
import ensureSeed from './seed'

ensureSeed({ force: process.argv.includes('--force') })
  .then((result) => {
    const state = result.seeded ? 'seeded' : 'up to date'
    console.log(
      `[e2e] ${result.database} ${state} (dataset ${result.version}, flow ${result.flow ? 'ok' : 'unavailable'}, ${
        result.ms
      }ms)`
    )
  })
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
