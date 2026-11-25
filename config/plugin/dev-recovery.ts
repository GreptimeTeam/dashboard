import type { Plugin } from 'vite'

/**
 * Dev-only safety net for the "white screen after an edit" failure mode.
 *
 * Two situations leave the dashboard permanently blank until the dev server is
 * restarted, both observed while editing this app:
 *
 * 1. A module request fails while the page loads — e.g. Vite re-optimizes
 *    dependencies mid-session ("new dependencies optimized: …") and an
 *    in-flight request hits a stale hash ("Outdated Optimize Dep"), or a
 *    dynamic import of a route / locale chunk is aborted. The entry module
 *    graph dies before `app.mount()` runs, so the page is blank with no error
 *    overlay.
 * 2. A module error during instantiation (a wrong named import, a typo in a
 *    bare specifier) leaves the same dead graph. Vite then delivers the *fix*
 *    as a normal HMR update, which is applied to a page that has no running
 *    app — so saving the corrected file does nothing and the page stays white.
 *
 * This injects a small client script that reloads the page for (1) and, once a
 * module error was seen, also on the next HMR update while the app root is
 * still empty, which makes (2) recover on the next successful save. Reloads are
 * throttled so a genuinely broken file cannot cause a reload loop.
 */
const RECOVERY_CLIENT = `
;(() => {
  const WINDOW_MS = 30000
  const MAX_RELOADS = 3
  const COOLDOWN_MS = 1000
  const KEY = '__vite_dev_recovery__'
  const ROOTS = ['#app', '#react-root']
  const PATTERNS = [
    /Failed to fetch dynamically imported module/i,
    /error loading dynamically imported module/i,
    /Importing a module script failed/i,
    /Outdated Optimize Dep/i,
    /504 \\(Outdated Optimize Dep\\)/i,
    /does not provide an export named/i,
    /Unable to preload CSS for/i,
  ]

  let moduleErrorSeen = false
  let lastReloadAt = 0

  const appMounted = () =>
    ROOTS.some((selector) => {
      const root = document.querySelector(selector)
      return !!root && root.childElementCount > 0
    })

  const takeBudget = () => {
    const now = Date.now()
    let state = { t: 0, n: 0 }
    try {
      state = JSON.parse(sessionStorage.getItem(KEY) || 'null') || state
    } catch {}
    if (!state.t || now - state.t > WINDOW_MS) state = { t: now, n: 0 }
    if (state.n >= MAX_RELOADS) return false
    state.n += 1
    try {
      sessionStorage.setItem(KEY, JSON.stringify(state))
    } catch {}
    return true
  }

  const reload = (reason, force) => {
    if (Date.now() - lastReloadAt < COOLDOWN_MS) return
    if (!force && !takeBudget()) {
      console.error(
        '[dev-recovery] page is broken (' + reason + ') and the reload limit is reached; ' +
          'fix the error above — the next successful save will reload the page.'
      )
      return
    }
    lastReloadAt = Date.now()
    console.warn('[dev-recovery] ' + reason + ' → reloading page')
    location.reload()
  }

  const onModuleError = (reason) => {
    moduleErrorSeen = true
    reload(reason)
  }

  const matches = (message) => PATTERNS.some((pattern) => pattern.test(message))

  window.addEventListener('vite:preloadError', (event) => {
    event.preventDefault?.()
    onModuleError('module preload failed')
  })

  window.addEventListener(
    'error',
    (event) => {
      const message = String(event?.message || event?.target?.src || '')
      if (message && matches(message)) onModuleError(message)
    },
    true
  )

  window.addEventListener('unhandledrejection', (event) => {
    const reason = event?.reason
    const message = String((reason && (reason.message || reason)) || '')
    if (message && matches(message)) onModuleError(message)
  })

  // Reuse the HMR client Vite already loaded (same module URL → same instance,
  // no second websocket) to notice saves that arrive while the app is dead.
  const watchHmr = async () => {
    try {
      const script = document.querySelector('script[type="module"][src*="@vite/client"]')
      if (!script || !script.src) return
      const client = await import(/* @vite-ignore */ script.src)
      if (!client || typeof client.createHotContext !== 'function') return
      const hot = client.createHotContext('/@vite/dev-recovery')
      const check = () => {
        if (!moduleErrorSeen || appMounted()) return
        reload('app did not mount after an update', true)
      }
      hot.on('vite:beforeUpdate', check)
      hot.on('vite:afterUpdate', check)
      hot.on('vite:ws:connect', check)
    } catch (error) {
      console.debug('[dev-recovery] could not watch HMR updates', error)
    }
  }
  watchHmr()
})()
`

export default function devRecoveryPlugin(): Plugin {
  return {
    name: 'greptime:dev-recovery',
    apply: 'serve',
    // `vite-plugin-html` regenerates the whole document from the template file, so
    // this has to run after the regular html hooks or the tag gets dropped.
    transformIndexHtml: {
      order: 'post',
      transform(html) {
        return {
          html,
          tags: [
            {
              tag: 'script',
              attrs: { type: 'module' },
              children: RECOVERY_CLIENT,
              injectTo: 'head-prepend',
            },
          ],
        }
      },
    },
  }
}
