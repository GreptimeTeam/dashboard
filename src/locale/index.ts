import { createI18n } from 'vue-i18n'
import en from './en-US'

export const LOCALE_OPTIONS = [
  { label: 'English', value: 'en-US' },
  { label: '中文', value: 'zh-CN' },
  { label: '日本語', value: 'ja-JP' },
]

const STORAGE_KEY = 'greptime-locale'

function detectLocale(): string {
  // 1) explicit storage (user has set a language before)
  const stored = localStorage.getItem(STORAGE_KEY)
  if (stored) return stored

  // 2) env default
  const envLang = import.meta.env.VITE_LANG
  if (envLang) return envLang

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

export async function loadLocale(locale: string): Promise<void> {
  if (!LOCALE_LOADERS[locale] || loadedLocales.has(locale)) return
  const { default: messages } = await LOCALE_LOADERS[locale]()
  // Legacy-mode global (VueI18n) exposes the singular `mergeLocaleMessage`.
  i18n.global.mergeLocaleMessage(locale, messages)
  loadedLocales.add(locale)
}

export async function initLocale(): Promise<void> {
  const target = detectLocale()
  await loadLocale(target)
  // Legacy-mode global stores the locale as a plain writable string.
  i18n.global.locale = target
}

export default i18n
