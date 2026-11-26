#!/usr/bin/env node
/**
 * Run the e2e suite against a published dashboard release: download its HTML bundle, serve it as
 * `dist/`, and test that build instead of the local one.
 *
 *   pnpm e2e:release                   # latest release, full suite (the same cases as pnpm e2e)
 *   pnpm e2e:release v0.14.7           # a specific tag
 *   pnpm e2e:release:smoke             # the six @smoke cases only (version-independent gate)
 *
 * No token and no API rate limit: the tag comes from the `releases/latest` redirect, and the
 * `build.tar.gz` asset is downloaded from the public release page. Everything is cached under
 * `artifacts/release-verify/<tag>/` — delete that directory to download again.
 *
 * Expect failures when the release predates features on this branch: the suite describes the
 * current UI, so a tag cut before a feature existed cannot satisfy its cases. `--smoke` is the
 * version-independent subset; the script says so when a full run fails.
 */
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'

const REPO = 'GreptimeTeam/dashboard'
const ROOT = path.resolve(import.meta.dirname, '..')
const WORK_ROOT = path.join(ROOT, 'artifacts/release-verify')

const log = (message) => console.log(`[release] ${message}`)

/** `v0.14.7`, `0.14.7` and no argument (= latest) all work. */
async function resolveTag(argument) {
  if (argument) return argument.startsWith('v') ? argument : `v${argument}`
  const response = await fetch(`https://github.com/${REPO}/releases/latest`, { redirect: 'manual' })
  const location = response.headers.get('location') || ''
  const tag = /\/releases\/tag\/([^/?#]+)/.exec(location)?.[1]
  if (!tag)
    throw new Error(`cannot resolve the latest release (HTTP ${response.status}, location: ${location || 'none'})`)
  return tag
}

async function download(url, target) {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`${url} -> HTTP ${response.status}`)
  const body = Buffer.from(await response.arrayBuffer())
  writeFileSync(target, body)
  return body.length
}

/** First directory (depth <= 3) that holds an `index.html`; the archive layout is not guaranteed. */
function findDist(root, depth = 0) {
  if (!existsSync(root)) return undefined
  if (existsSync(path.join(root, 'index.html'))) return root
  if (depth >= 3) return undefined
  return readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => findDist(path.join(root, entry.name), depth + 1))
    .find(Boolean)
}

const smoke = process.argv.includes('--smoke')
const tagArgument = process.argv.slice(2).find((argument) => !argument.startsWith('--'))
const tag = await resolveTag(tagArgument)
const workDir = path.join(WORK_ROOT, tag)
const tarball = path.join(workDir, 'build.tar.gz')
log(`${tag}${tagArgument ? '' : ' (latest)'} — ${smoke ? '@smoke' : 'full suite'}`)

let dist = findDist(workDir)
if (dist) {
  log(`cached ${path.relative(ROOT, dist)} (delete artifacts/release-verify/${tag} to refresh)`)
} else {
  mkdirSync(workDir, { recursive: true })
  const baseUrl = `https://github.com/${REPO}/releases/download/${tag}`

  if (!existsSync(tarball)) {
    log(`downloading ${baseUrl}/build.tar.gz`)
    const bytes = await download(`${baseUrl}/build.tar.gz`, tarball)
    log(`downloaded ${(bytes / 1e6).toFixed(1)} MB`)

    const checksum = await fetch(`${baseUrl}/sha256.txt`).then((response) => (response.ok ? response.text() : ''))
    const expected = /([0-9a-f]{64})/i.exec(checksum)?.[1]
    if (expected) {
      const actual = createHash('sha256').update(readFileSync(tarball)).digest('hex')
      if (actual !== expected) throw new Error(`sha256 mismatch: expected ${expected}, got ${actual}`)
      log('sha256 ok')
    } else {
      log('sha256.txt not available, skipping checksum')
    }
  } else {
    log(`using cached ${path.relative(ROOT, tarball)}`)
  }

  const extract = spawnSync('tar', ['-xzf', tarball, '-C', workDir], { encoding: 'utf8' })
  if (extract.status !== 0) throw new Error(`tar -xzf failed: ${extract.stderr || extract.status}`)
  dist = findDist(workDir)
  if (!dist) throw new Error(`${tarball} does not contain an index.html within 3 levels`)
}

const entry = /src="([^"]*assets\/index-[^"]+\.js)"/.exec(readFileSync(path.join(dist, 'index.html'), 'utf8'))?.[1]
log(`serving ${path.relative(ROOT, dist)}${entry ? ` (${entry})` : ''}`)

const report = path.join(workDir, smoke ? 'report-smoke.html' : 'report.html')
const result = spawnSync(
  'pnpm',
  ['exec', 'playwright', 'test', '-c', 'playwright.e2e.config.ts', ...(smoke ? ['--grep', '@smoke'] : [])],
  {
    cwd: ROOT,
    stdio: 'inherit',
    env: { ...process.env, E2E_DIST_DIR: dist, E2E_REPORT_FILE: report },
  }
)

const passed = result.status === 0
console.log(`\n[release] ${tag}: ${passed ? 'PASS' : 'FAIL'} — report: ${path.relative(ROOT, report)}`)
if (!passed && !smoke) {
  console.log(
    `[release] If ${tag} predates features on this branch those cases cannot pass; ` +
      '`pnpm e2e:release:smoke` is the version-independent gate.'
  )
}
process.exit(result.status ?? 1)
