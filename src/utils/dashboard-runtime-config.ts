/**
 * Optional config injected into index.html by live-demo pack CI only
 * (`.github/workflows/live-demo-pack.yml`, values from Actions vars).
 * Not present in OSS / docker builds.
 *
 * window.__GREPTIME_DASHBOARD_RUNTIME__ = {
 *   username: string,
 *   password: string,
 *   queryGuide: boolean,
 * }
 */

export const DASHBOARD_RUNTIME_GLOBAL_KEY = '__GREPTIME_DASHBOARD_RUNTIME__'

export interface DashboardRuntimeConfig {
  username?: string
  password?: string
  queryGuide?: boolean
}

declare global {
  interface Window {
    __GREPTIME_DASHBOARD_RUNTIME__?: DashboardRuntimeConfig
  }
}

export function getDashboardRuntimeConfig(
  win: Window | undefined = typeof window !== 'undefined' ? window : undefined
): DashboardRuntimeConfig | null {
  if (!win) return null
  const raw = win.__GREPTIME_DASHBOARD_RUNTIME__
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  return raw
}

/** True when deploy-time demo username/password are present. */
export function hasRuntimeDemoAuth(runtime: DashboardRuntimeConfig | null | undefined): boolean {
  if (!runtime) return false
  return typeof runtime.username === 'string' && typeof runtime.password === 'string'
}

export function isRuntimeQueryGuideEnabled(runtime: DashboardRuntimeConfig | null | undefined): boolean {
  return runtime?.queryGuide === true
}

export default getDashboardRuntimeConfig
