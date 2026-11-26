#!/usr/bin/env node
/**
 * Mutation check: does the e2e suite actually go red when the product breaks?
 *
 * Each entry below is a one-line defect seeded into `src/`, rebuilt, and run against the spec that
 * is supposed to catch it. A suite whose assertions only mirror the network traffic will report
 * MISSED here — which is the whole point of the exercise.
 *
 *   node scripts/e2e-mutation-check.mjs              # all mutations
 *   node scripts/e2e-mutation-check.mjs --only M1,M3 # subset
 *   node scripts/e2e-mutation-check.mjs --list       # show them, do nothing
 *
 * Nightly / on demand, not on every PR: each mutation costs one production build (~40s) plus the
 * targeted spec. Needs a built app (it rebuilds), GreptimeDB on 127.0.0.1:4000, and a free port
 * (E2E_MUTATION_PORT, default 4199).
 *
 * Exit code: 0 when every mutation was caught, 1 when at least one slipped through.
 */
import { spawnSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'

const ROOT = path.resolve(import.meta.dirname, '..')
const PORT = process.env.E2E_MUTATION_PORT || '4199'
const REPORT = path.join(ROOT, 'artifacts/e2e/mutation.md')
const MUTATED_REPORT = 'artifacts/e2e/mutation-report.html'

/** @type {{id: string, what: string, file: string, find: string, replace: string, spec: string, grep: string}[]} */
const MUTATIONS = [
  {
    id: 'M1',
    what: 'logs grid renders only the first row',
    file: 'src/views/dashboard/logs/query/index.vue',
    find: ':data="rows"',
    replace: ':data="rows.slice(0, 1)"',
    spec: 'tests/e2e/specs/03-logs.spec.ts',
    grep: 'severity and service filters combine',
  },
  {
    id: 'M2',
    what: 'metrics result table drops rows',
    file: 'src/views/dashboard/metrics/index.vue',
    find: 'const tableData = computed(() => promInstantResultToTableRows(tableResults.value))',
    replace: 'const tableData = computed(() => promInstantResultToTableRows(tableResults.value).slice(0, 2))',
    spec: 'tests/e2e/specs/02-metrics.spec.ts',
    grep: 'table tab runs an instant query',
  },
  {
    id: 'M3',
    what: 'empty result window hides the row count (blank state)',
    file: 'src/views/dashboard/logs/query/index.vue',
    find: 'span.results-count(v-if="rows.length > 0 || totalRowCount !== null")',
    replace: 'span.results-count(v-if="rows.length > 1")',
    spec: 'tests/e2e/specs/03-logs.spec.ts',
    grep: 'empty window reports zero rows',
  },
  {
    id: 'M4',
    what: 'logs query ignores the URL time window',
    file: 'src/hooks/use-query-execution.ts',
    find: '? builder.generateSql(builder.builderFormState, timeRange.timeRangeValues.value)',
    replace: '? builder.generateSql(builder.builderFormState, [])',
    spec: 'tests/e2e/specs/03-logs.spec.ts',
    grep: 'absolute window keeps only the first half hour',
  },
  {
    id: 'M5',
    what: '?create=1 no longer opens the create editor',
    file: 'src/views/dashboard/logs/pipelines/index.vue',
    find: "      if (route.query.create === '1') {\n        clickNewFile()\n",
    replace: "      if (route.query.create === '1') {\n",
    spec: 'tests/e2e/specs/04-pipelines.spec.ts',
    grep: 'opens the create editor',
  },
  {
    id: 'M6',
    what: 'log ingestion posts the table and pipeline swapped',
    file: 'src/api/pipeline.ts',
    find: '      db,\n      table,\n      pipeline_name: pipelineName,\n',
    replace: '      db,\n      table: pipelineName,\n      pipeline_name: table,\n',
    spec: 'tests/e2e/specs/07-ingest.spec.ts',
    grep: 'log ingestion writes NDJSON',
  },
]

const args = process.argv.slice(2)
if (args.includes('--list')) {
  MUTATIONS.forEach((mutation) => console.log(`${mutation.id}  ${mutation.what}  ->  ${mutation.spec}`))
  process.exit(0)
}
const onlyIndex = args.indexOf('--only')
const selected =
  onlyIndex >= 0
    ? MUTATIONS.filter((mutation) => (args[onlyIndex + 1] || '').split(',').includes(mutation.id))
    : MUTATIONS
if (selected.length === 0) {
  console.error('no matching mutation')
  process.exit(1)
}

const run = (command, commandArgs, env) => {
  const result = spawnSync(command, commandArgs, {
    cwd: ROOT,
    env: { ...process.env, ...env },
    encoding: 'utf8',
    timeout: 10 * 60 * 1000,
  })
  return { status: result.status, output: `${result.stdout || ''}${result.stderr || ''}` }
}

const build = () => {
  const { status, output } = run('pnpm', ['exec', 'vite', 'build', '--config', './config/vite.config.prod.ts'])
  if (status !== 0) throw new Error(`build failed:\n${output.split('\n').slice(-25).join('\n')}`)
}

/** Parses the reporter's summary line: "[e2e] 7 tests: 6 passed, 1 failed, 0 skipped". */
const summary = (output) => {
  const match = /\[e2e\] (\d+) tests: (\d+) passed, (\d+) failed, (\d+) skipped/.exec(output)
  return match
    ? { total: Number(match[1]), passed: Number(match[2]), failed: Number(match[3]), skipped: Number(match[4]) }
    : undefined
}

console.log(`[mutation] ${selected.length} mutation(s), port ${PORT}`)
build()

const results = []
for (const mutation of selected) {
  const absolute = path.join(ROOT, mutation.file)
  const original = readFileSync(absolute, 'utf8')
  const hits = original.split(mutation.find).length - 1
  if (hits !== 1) {
    results.push({ ...mutation, verdict: 'INVALID', detail: `find string occurs ${hits} times` })
    console.log(`${mutation.id} INVALID — "${mutation.find.slice(0, 60)}" occurs ${hits} times`)
    continue
  }

  console.log(`\n[mutation] ${mutation.id}: ${mutation.what}`)
  writeFileSync(absolute, original.replace(mutation.find, mutation.replace))
  try {
    build()
    const { status, output } = run(
      'pnpm',
      ['exec', 'playwright', 'test', '-c', 'playwright.e2e.config.ts', mutation.spec, '--grep', mutation.grep],
      { E2E_PORT: PORT, E2E_REPORT_FILE: MUTATED_REPORT }
    )
    const counts = summary(output)
    const verdict = !counts
      ? 'INVALID'
      : counts.failed > 0 || status !== 0
        ? 'CAUGHT'
        : counts.skipped > 0
          ? 'SKIPPED'
          : 'MISSED'
    const detail = counts
      ? `${counts.total} tests, ${counts.failed} failed, ${counts.skipped} skipped`
      : `no summary (exit ${status})`
    results.push({ ...mutation, verdict, detail })
    console.log(`[mutation] ${mutation.id} ${verdict} (${detail})`)
  } finally {
    writeFileSync(absolute, original)
  }
}

// Restore the tree, then rebuild so the freshness guard accepts the local dist again.
build()

const caught = results.filter((result) => result.verdict === 'CAUGHT').length
const missed = results.filter((result) => result.verdict === 'MISSED').length
const skipped = results.filter((result) => result.verdict === 'SKIPPED').length
const invalid = results.filter((result) => result.verdict === 'INVALID').length

const lines = [
  '# e2e mutation check',
  '',
  `${new Date().toISOString()} · ${results.length} mutations · **${caught} caught**, ${missed} missed, ${skipped} skipped, ${invalid} invalid`,
  '',
  '| id | seeded defect | verdict | evidence |',
  '| --- | --- | --- | --- |',
  ...results.map(
    (result) =>
      `| ${result.id} | ${result.what} | ${result.verdict} | ${result.detail.replace(/\|/g, '\\|')} |`
  ),
  '',
]
mkdirSync(path.dirname(REPORT), { recursive: true })
writeFileSync(REPORT, lines.join('\n'))

console.log(`\n[mutation] ${caught}/${results.length} caught, ${missed} missed, ${skipped} skipped`)
console.log(`[mutation] report: ${path.relative(ROOT, REPORT)}`)
process.exit(missed > 0 || invalid > 0 ? 1 : 0)
