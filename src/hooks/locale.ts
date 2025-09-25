import { Message } from '@arco-design/web-vue'
import { useLocalStorage } from '@vueuse/core'
import { useI18n } from 'vue-i18n'

export default function useLocale() {
  const { t, locale } = useI18n()

  const STORAGE_KEY = 'greptime-locale'

  const currentLocale = useLocalStorage(STORAGE_KEY, 'en-US')

  watch(currentLocale, (val) => {
    locale.value = val
  })

  const onChangeLocale = () => {
    nextTick(() => {
      Message.success(t('navbar.action.locale'))
    })
  }

  return { currentLocale, onChangeLocale }
}
