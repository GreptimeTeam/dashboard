import { createI18n } from 'vue-i18n'
import en from './en-US'
import cn from './zh-CN'

export const LOCALE_OPTIONS = [
  { label: '中文', value: 'zh-CN' },
  { label: 'English', value: 'en-US' },
]

const STORAGE_KEY = 'greptime-locale'

function detectLocale(): string {
  // 1) explicit storage
  const stored = localStorage.getItem('greptime-locale')
  if (stored) return stored

  // 2) env default
  const envLang = import.meta.env.VITE_LANG
  if (envLang) return envLang

  // 3) enterprise and browser
  const appName = import.meta.env.VITE_APP_NAME
  if (appName === 'enterprise') {
    const navLang = (navigator.language || navigator.languages?.[0] || '').toLowerCase()
    if (navLang.startsWith('zh')) return 'zh-CN'
    return 'en-US'
  }

  // 4) default to en-US
  return 'en-US'
}

const i18n = createI18n({
  locale: detectLocale(),
  fallbackLocale: 'en-US',
  allowComposition: true,
  messages: {
    'en-US': en,
    'zh-CN': cn,
  },
})

export default i18n
