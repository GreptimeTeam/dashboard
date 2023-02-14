import { App, createApp } from 'vue'
import { CrossStorageHub } from 'cross-storage'
import ArcoVue from '@arco-design/web-vue'
import ArcoVueIcon from '@arco-design/web-vue/es/icon'
import globalComponents from '@/components'
import router from './router'
import store from './store'
import i18n from './locale'
import directive from './directive'
import './mock'
import Apps from './App.vue'
import '@arco-design/web-vue/dist/arco.css'
import '@/assets/style/global.less'
import '@/api/interceptor'

const app: App = createApp(Apps)

app.use(ArcoVue, {})
app.use(ArcoVueIcon)

app.use(router)
app.use(store)
app.use(i18n)
app.use(globalComponents)
app.use(directive)

CrossStorageHub.init([{ origin: new RegExp(import.meta.env.VITE_CLOUD_URL), allow: ['get', 'set'] }])
app.mount('#app')
