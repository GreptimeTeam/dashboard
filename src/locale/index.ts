import { createI18n } from 'vue-i18n'
import en from './en-US'

export const LOCALE_OPTIONS = [
  { label: 'English', value: 'en-US' },
  { label: '中文', value: 'zh-CN' },
  { label: '日本語', value: 'ja-JP' },
]

const LEGACY_STORAGE_KEY = 'greptime-locale'

function isSupportedLocale(value: string): boolean {
  return LOCALE_OPTIONS.some((option) => option.value === value)
}

function readStoredLocale(): string | null {
  try {
    const raw = localStorage.getItem('uiConfig')
    if (raw) {
      const ui = JSON.parse(raw) as { locale?: unknown }
      if (typeof ui.locale === 'string' && isSupportedLocale(ui.locale)) {
        return ui.locale
      }
    }
    const legacy = localStorage.getItem(LEGACY_STORAGE_KEY)
    if (legacy && isSupportedLocale(legacy)) {
      return legacy
    }
  } catch {
    // ignore storage failures (private mode / disabled storage)
  }
  return null
}

function detectLocale(): string {
  // 1) explicit storage (uiConfig.locale, or the pre-merge key)
  const stored = readStoredLocale()
  if (stored) return stored

  // 2) env default
  const envLang = import.meta.env.VITE_LANG
  if (envLang && isSupportedLocale(envLang)) return envLang

  // 3) browser language
  const navLang = (navigator.language || navigator.languages?.[0] || '').toLowerCase()
  if (navLang.startsWith('zh')) return 'zh-CN'
  if (navLang.startsWith('ja')) return 'ja-JP'

  // 4) default to en-US
  return 'en-US'
}

// Fallback locale stays statically bundled; other locales load on demand.
const LOCALE_LOADERS: Record<string, () => Promise<{ default: Record<string, string> }>> = {
  'zh-CN': () => import('./zh-CN'),
  'ja-JP': () => import('./ja-JP'),
}

const i18n = createI18n({
  locale: 'en-US',
  fallbackLocale: 'en-US',
  allowComposition: true,
  messages: {
    'en-US': en,
  },
})

const loadedLocales = new Set<string>(['en-US'])

// Keep the parameter name off the bare identifier `locale`: AutoImport scans
// src/hooks and would inject the locale hook's default export here, creating a
// locale → hook → locale cycle (the `i18n` TDZ error).
export async function loadLocale(nextLocale: string): Promise<void> {
  if (!LOCALE_LOADERS[nextLocale] || loadedLocales.has(nextLocale)) return
  const { default: messages } = await LOCALE_LOADERS[nextLocale]()
  // Legacy-mode global (VueI18n) exposes the singular `mergeLocaleMessage`.
  i18n.global.mergeLocaleMessage(nextLocale, messages)
  loadedLocales.add(nextLocale)
}

export async function initLocale(): Promise<void> {
  const target = detectLocale()
  await loadLocale(target)
  // Legacy-mode global stores the locale as a plain writable string.
  i18n.global.locale = target
  // The store migrates `uiConfig.locale` from the legacy key on first creation; user
  // changes are persisted there by `useLocale`. No store import here, otherwise the
  // interceptor/store chain would loop back into this module.
}

export default i18n
