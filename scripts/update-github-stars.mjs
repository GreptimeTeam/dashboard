#!/usr/bin/env node
/**
 * Refresh the committed GitHub stars fallback used when the live API fails.
 *
 * Usage:
 *   node scripts/update-github-stars.mjs
 *   GITHUB_TOKEN=... node scripts/update-github-stars.mjs
 *
 * On fetch failure the existing constant is left unchanged (exit 0) so builds
 * still succeed with the previous near-current value.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO = 'GreptimeTeam/greptimedb'
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const TARGET = join(ROOT, 'src/constants/github-stars.ts')

const FILE_TEMPLATE = (count) =>
  `/**
 * Last-known GreptimeDB GitHub star count.
 * Refreshed by \`pnpm update:github-stars\` during production builds / release CI
 * so the UI can fall back to a near-current value when the live API fails.
 */
const GITHUB_STARS_FALLBACK = ${count}

export default GITHUB_STARS_FALLBACK
`

function readExistingFallback() {
  try {
    const source = readFileSync(TARGET, 'utf8')
    const match = source.match(/GITHUB_STARS_FALLBACK\s*=\s*(\d+)\b/)
    return match ? Number(match[1]) : null
  } catch {
    return null
  }
}

async function fetchStargazersCount() {
  const headers = {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'greptime-dashboard-update-github-stars',
    'X-GitHub-Api-Version': '2022-11-28',
  }
  const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN
  if (token) {
    headers.Authorization = `Bearer ${token}`
  }

  const response = await fetch(`https://api.github.com/repos/${REPO}`, { headers })
  if (!response.ok) {
    throw new Error(`GitHub API ${response.status}: ${await response.text()}`)
  }
  const data = await response.json()
  if (typeof data.stargazers_count !== 'number') {
    throw new Error('GitHub API response missing stargazers_count')
  }
  return data.stargazers_count
}

async function main() {
  const previous = readExistingFallback()
  try {
    const stars = await fetchStargazersCount()
    if (previous === stars) {
      console.log(`[update-github-stars] unchanged: ${stars}`)
      return
    }
    writeFileSync(TARGET, FILE_TEMPLATE(stars), 'utf8')
    console.log(
      `[update-github-stars] updated${previous == null ? '' : ` ${previous} →`} ${stars}`
    )
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (previous != null) {
      console.warn(`[update-github-stars] fetch failed, keeping ${previous}: ${message}`)
      return
    }
    console.error(`[update-github-stars] fetch failed and no existing fallback: ${message}`)
    process.exitCode = 1
  }
}

main()
