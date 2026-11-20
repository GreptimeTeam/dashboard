import fs from 'node:fs'
import path from 'node:path'
import type { SmokePage } from './catalog'
import type { SmokeFixture } from './fixtures/types'

export type PageReport = {
  file: string
  name: string
  label: string
  status: 'pass' | 'fail' | 'warn'
  seconds: number
  note: string
}

export type SmokeSummary = {
  runId: string
  database: string
  baseURL: string
  strict: boolean
  startedAt: string
  finishedAt: string
  totalSeconds: number
  pass: number
  fail: number
  warn: number
  pages: PageReport[]
  fixture: SmokeFixture
}

const CSS = `
:root{color-scheme:light;--bg:#f4f5f7;--card:#fff;--text:#1d2129;--muted:#86909c;--line:#e5e6eb;--accent:#165dff;--ok:#00b42a;--warn:#ff7d00;--fail:#f53f3f}
*{box-sizing:border-box}body{margin:0;font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,sans-serif;background:var(--bg);color:var(--text);line-height:1.5}
header{position:sticky;top:0;z-index:10;background:rgba(255,255,255,.94);backdrop-filter:blur(8px);border-bottom:1px solid var(--line);padding:16px 24px}
header h1{margin:0 0 4px;font-size:20px}header p{margin:0;color:var(--muted);font-size:13px}
.summary{display:flex;gap:12px;flex-wrap:wrap;margin-top:12px}
.pill{font-size:12px;font-weight:600;padding:4px 10px;border-radius:999px;background:#fff;border:1px solid var(--line)}
.pill.ok{color:var(--ok);border-color:#b7f0c2}.pill.warn{color:var(--warn);border-color:#ffd19a}.pill.fail{color:var(--fail);border-color:#f9b4b4}
main{max-width:1100px;margin:0 auto;padding:24px}
figure{margin:0 0 28px;background:var(--card);border:1px solid var(--line);border-radius:12px;overflow:hidden;box-shadow:0 1px 2px rgba(0,0,0,.04)}
img{display:block;width:100%;height:auto;background:#111}
figcaption{padding:12px 14px;font-size:13px;color:var(--muted);border-top:1px solid var(--line);display:flex;gap:10px;flex-wrap:wrap;align-items:center}
figcaption code{color:var(--text)}
.badge{font-size:11px;font-weight:700;text-transform:uppercase;padding:2px 8px;border-radius:6px;color:#fff}
.badge.pass{background:var(--ok)}.badge.fail{background:var(--fail)}.badge.warn{background:var(--warn)}
.missing{padding:16px;color:var(--fail);font-size:13px}
`

export function writeReport(root: string, summary: SmokeSummary, pages: SmokePage[]): string {
  fs.mkdirSync(root, { recursive: true })
  const summaryPath = path.join(root, 'summary.json')
  fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2))

  const pills = [
    `<span class="pill ok">pass ${summary.pass}</span>`,
    `<span class="pill warn">warn ${summary.warn}</span>`,
    `<span class="pill fail">fail ${summary.fail}</span>`,
    `<span class="pill">${summary.totalSeconds.toFixed(1)}s</span>`,
    `<span class="pill">db ${summary.database}</span>`,
  ].join('')

  const figures = summary.pages
    .map((page) => {
      const shot = path.join(root, 'screenshots', page.file)
      const rel = `screenshots/${page.file}`
      if (!fs.existsSync(shot)) {
        return `<p class="missing">missing: <code>${rel}</code> — ${page.label} [${page.status}] ${page.note}</p>`
      }
      return `<figure>
  <a href="${rel}" target="_blank" rel="noopener"><img src="${rel}" alt="${page.label}" loading="lazy"/></a>
  <figcaption>
    <span class="badge ${page.status}">${page.status}</span>
    <code>${page.file}</code>
    <span>${page.label}</span>
    <span>${page.seconds.toFixed(1)}s</span>
    <span>${page.note}</span>
  </figcaption>
</figure>`
    })
    .join('\n')

  const catalogHint = pages.map((p) => p.name).join(' → ')
  const html = `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>Menu smoke — ${summary.runId}</title><style>${CSS}</style></head><body>
<header>
  <h1>Menu smoke report</h1>
  <p>${summary.startedAt} · ${summary.baseURL} · strict=${summary.strict} · ${catalogHint}</p>
  <div class="summary">${pills}</div>
</header>
<main>${figures}</main>
</body></html>`

  const indexPath = path.join(root, 'index.html')
  fs.writeFileSync(indexPath, html, 'utf8')
  return indexPath
}
