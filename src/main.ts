import { App, createApp } from 'vue'
import ArcoVue, { FormItem } from '@arco-design/web-vue'
import ArcoVueIcon from '@arco-design/web-vue/es/icon'
import globalComponents from '@/components'
import { initializeNews } from '@/hooks/news'
import '@/assets/icons'
import router from './router'
import store from './store'
import i18n, { initLocale } from './locale'
import directive from './directive'
import Apps from './App.vue'
import '@arco-design/web-vue/dist/arco.less'
import '@/assets/style/global.less'
import '@/api/interceptor'

const app: App = createApp(Apps)

// Required * after label text (Arco default: before label)
FormItem.props.asteriskPosition.default = 'end'

app.config.errorHandler = (err, vm, info) => {
  console.error(err, info)
  // Optionally show an error message to users
}

app.use(ArcoVue, {})
app.use(ArcoVueIcon)

app.use(store)
app.use(router)
app.use(i18n)
app.use(globalComponents)
app.use(directive)

initializeNews()

// Load the active locale dictionary before first paint so no raw keys flash.
// A failed locale chunk must never keep the app from mounting: `initLocale` pulls
// zh-CN / ja-JP through a dynamic import, and in dev that chunk can be rejected
// while Vite re-optimizes or hot-updates. Mounting with the en-US fallback keeps
// the dashboard usable instead of leaving a blank page behind.
initLocale()
  .catch((error) => {
    console.error('[locale] failed to load the active locale, falling back to en-US', error)
  })
  .then(() => {
    app.mount('#app')
  })
