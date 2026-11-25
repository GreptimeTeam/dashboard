/**
 * Self-contained HTML reporter: one `report.html` with every screenshot embedded (base64), so it
 * opens straight from disk (file://) — no server, no sibling files.
 */
import fs from 'node:fs'
import path from 'node:path'
import type { FullConfig, FullResult, Reporter, TestCase, TestResult } from '@playwright/test/reporter'

type Shot = { name: string; src: string }
type Entry = {
  file: string
  line: number
  title: string
  status: string
  ok: boolean
  duration: number
  error: string
  shots: Shot[]
  notes: string[]
}

const escapeHtml = (text: string) =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

// eslint-disable-next-line no-control-regex
const STATE: Record<string, string> = { passed: 'passed', skipped: 'skipped' }
const LABEL: Record<string, string> = { passed: 'PASS', skipped: 'SKIP', failed: 'FAIL' }

const ANSI = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, 'g')
const stripAnsi = (text: string) => text.replace(ANSI, '')

const CSS = `
:root{color-scheme:light dark;--bg:#f5f6f8;--card:#fff;--fg:#1c2330;--muted:#6b7587;--line:#e2e6ee;--ok:#168a4a;--bad:#d4332b;--skip:#b7791f}
@media (prefers-color-scheme:dark){:root{--bg:#12151b;--card:#1b2029;--fg:#e6e9ef;--muted:#8d97a8;--line:#2b3340}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font:14px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
header{position:sticky;top:0;z-index:5;background:var(--card);border-bottom:1px solid var(--line);padding:12px 24px;display:flex;flex-wrap:wrap;gap:16px;align-items:center}
h1{font-size:18px;margin:0}.meta{color:var(--muted)}
.pill{padding:2px 10px;border-radius:999px;font-weight:600;border:1px solid var(--line);cursor:pointer;background:transparent;color:var(--fg);font:inherit}
.pill.active{background:var(--fg);color:var(--bg)}.pill.ok{color:var(--ok)}.pill.bad{color:var(--bad)}.pill.skip{color:var(--skip)}
.pill.active.ok,.pill.active.bad,.pill.active.skip{color:var(--bg)}
main{padding:16px 24px 48px}section{margin-top:24px}
h2{font-size:15px;margin:0 0 10px;padding-bottom:6px;border-bottom:1px solid var(--line)}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(620px,1fr));gap:16px}
.card{background:var(--card);border:1px solid var(--line);border-radius:8px;overflow:hidden}
.card.failed{border-color:var(--bad)}
.head{padding:10px 14px;display:flex;gap:10px;align-items:flex-start}
.badge{flex:none;font-size:12px;font-weight:700;padding:1px 8px;border-radius:4px;color:#fff;margin-top:2px}
.badge.passed{background:var(--ok)}.badge.failed,.badge.timedOut{background:var(--bad)}.badge.skipped{background:var(--skip)}
.title{font-weight:600;flex:1}.sub{color:var(--muted);font-size:12px;font-weight:400}
.shot{display:block;width:100%;border-top:1px solid var(--line);cursor:zoom-in}
.cap{padding:4px 14px;color:var(--muted);font-size:12px}
pre{margin:0;padding:10px 14px;white-space:pre-wrap;word-break:break-word;font-size:12px;background:rgba(212,51,43,.08);border-top:1px solid var(--line)}
details{padding:6px 14px;border-top:1px solid var(--line);font-size:12px;color:var(--muted)}
#zoom{position:fixed;inset:0;background:rgba(0,0,0,.85);display:none;overflow:auto;z-index:20;cursor:zoom-out}
#zoom.on{display:block}#zoom img{display:block;margin:24px auto;max-width:none;width:1440px;box-shadow:0 0 24px #000}
.hidden{display:none!important}`

const JS = `
const cards=[...document.querySelectorAll('.card')];
const pills=[...document.querySelectorAll('.pill')];
function apply(f){pills.forEach(p=>p.classList.toggle('active',p.dataset.f===f));
cards.forEach(c=>c.classList.toggle('hidden',f!=='all'&&c.dataset.s!==f));
document.querySelectorAll('section').forEach(s=>s.classList.toggle('hidden',!s.querySelector('.card:not(.hidden)')))}
pills.forEach(p=>p.onclick=()=>apply(p.dataset.f));
const zoom=document.getElementById('zoom');
document.querySelectorAll('.shot').forEach(i=>i.onclick=()=>{zoom.querySelector('img').src=i.src;zoom.classList.add('on')});
zoom.onclick=()=>zoom.classList.remove('on');
document.addEventListener('keydown',e=>{if(e.key==='Escape')zoom.classList.remove('on')});`

export default class SingleFileReporter implements Reporter {
  private entries: Entry[] = []

  private outputFile = ''

  private startedAt = Date.now()

  private rootDir = ''

  onBegin(config: FullConfig): void {
    this.rootDir = config.rootDir
    this.outputFile = path.resolve(process.env.E2E_REPORT_FILE || 'artifacts/e2e/report.html')
    this.startedAt = Date.now()
  }

  onTestEnd(test: TestCase, result: TestResult): void {
    const shots: Shot[] = []
    const notes: string[] = []
    result.attachments.forEach((attachment) => {
      const body = attachment.body ?? (attachment.path ? fs.readFileSync(attachment.path) : undefined)
      if (!body) return
      if (attachment.contentType.startsWith('image/')) {
        shots.push({ name: attachment.name, src: `data:${attachment.contentType};base64,${body.toString('base64')}` })
      } else if (attachment.contentType.startsWith('text/')) {
        notes.push(`${attachment.name}\n${body.toString('utf8')}`)
      }
    })
    const failed = result.status !== 'passed' && result.status !== 'skipped'
    this.entries.push({
      file: path.relative(this.rootDir, test.location.file),
      line: test.location.line,
      title: test.titlePath().slice(3).join(' › '),
      status: result.status,
      ok: !failed,
      duration: result.duration,
      error: stripAnsi(result.errors.map((error) => error.message || error.stack || '').join('\n\n')),
      shots,
      notes,
    })
  }

  onEnd(result: FullResult): void {
    const count = (status: string) => this.entries.filter((entry) => entry.status === status).length
    const passed = count('passed')
    const skipped = count('skipped')
    const failed = this.entries.length - passed - skipped
    const seconds = ((Date.now() - this.startedAt) / 1000).toFixed(1)

    const byFile = new Map<string, Entry[]>()
    this.entries.forEach((entry) => byFile.set(entry.file, [...(byFile.get(entry.file) || []), entry]))

    const sections = [...byFile.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([file, entries]) => {
        const cards = entries
          .map((entry) => {
            const state = STATE[entry.status] || 'failed'
            const shots = entry.shots
              .map(
                (shot) =>
                  `<img class="shot" loading="lazy" alt="${escapeHtml(entry.title)}" src="${
                    shot.src
                  }"/><div class="cap">${escapeHtml(shot.name)}</div>`
              )
              .join('')
            const error = entry.error ? `<pre>${escapeHtml(entry.error)}</pre>` : ''
            const notes = entry.notes.length
              ? `<details><summary>${entry.notes.length} note(s)</summary><pre>${escapeHtml(
                  entry.notes.join('\n\n')
                )}</pre></details>`
              : ''
            return `<div class="card ${state}" data-s="${state}"><div class="head"><span class="badge ${
              entry.status
            }">${LABEL[state]}</span><div class="title">${escapeHtml(entry.title)}<div class="sub">${escapeHtml(
              entry.file
            )}:${entry.line} · ${entry.duration} ms</div></div></div>${error}${shots}${notes}</div>`
          })
          .join('')
        return `<section><h2>${escapeHtml(file)} <span class="meta">(${
          entries.length
        })</span></h2><div class="grid">${cards}</div></section>`
      })
      .join('')

    const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"/><title>Dashboard e2e report</title><style>${CSS}</style></head><body>
<header><h1>Dashboard e2e report</h1>
<span class="meta">${new Date().toLocaleString()} · ${seconds}s · ${escapeHtml(result.status)}</span>
<span><button class="pill active" data-f="all">All ${this.entries.length}</button>
<button class="pill ok" data-f="passed">Passed ${passed}</button>
<button class="pill bad" data-f="failed">Failed ${failed}</button>
<button class="pill skip" data-f="skipped">Skipped ${skipped}</button></span>
<span class="meta">click a screenshot to enlarge · Esc to close</span></header>
<main>${sections}</main><div id="zoom"><img alt=""/></div><script>${JS}</script></body></html>`

    fs.mkdirSync(path.dirname(this.outputFile), { recursive: true })
    fs.writeFileSync(this.outputFile, html)
    // eslint-disable-next-line no-console
    console.log(`\n  Report: file://${this.outputFile}`)
  }
}
