import { Message } from '@arco-design/web-vue'
import { ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import i18n, { loadLocale } from '@/locale'

// Shared across every caller: App, navbar and the command palette must never disagree
// about the active locale, and the preference now lives in uiConfig.
const currentLocale = ref(i18n.global.locale as string)

export default function useLocale() {
  const { t, locale } = useI18n()

  // `initLocale` runs before mount; sync in case this module was evaluated earlier.
  const resolved = i18n.global.locale as string
  if (currentLocale.value !== resolved) {
    currentLocale.value = resolved
  }

  watch(currentLocale, async (val) => {
    if (!val) return
    await loadLocale(val)
    const changed = i18n.global.locale !== val
    i18n.global.locale = val
    locale.value = val
    if (changed) {
      // Dynamic import keeps the store (→ editor → interceptor → locale) out of this
      // module's static graph; importing it at module scope made `i18n` TDZ.
      const { useAppStore } = await import('@/store')
      useAppStore().applyUiConfig({ locale: val })
    }
  })

  const onChangeLocale = () => {
    nextTick(() => {
      Message.success(t('navbar.action.locale'))
    })
  }

  return { currentLocale, onChangeLocale }
}
