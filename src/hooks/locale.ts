import { Message } from '@arco-design/web-vue'
import { useLocalStorage } from '@vueuse/core'
import { useI18n } from 'vue-i18n'
import i18n, { loadLocale } from '@/locale'

export default function useLocale() {
  const { t, locale } = useI18n()

  const STORAGE_KEY = 'greptime-locale'

  // Default to the locale already resolved during app bootstrap (initLocale).
  // Legacy-mode global exposes the locale as a plain string.
  const currentLocale = useLocalStorage(STORAGE_KEY, i18n.global.locale as string)

  watch(currentLocale, async (val) => {
    await loadLocale(val)
    locale.value = val
  })

  const onChangeLocale = () => {
    nextTick(() => {
      Message.success(t('navbar.action.locale'))
    })
  }

  return { currentLocale, onChangeLocale }
}
