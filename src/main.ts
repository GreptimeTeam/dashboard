import { App, createApp } from 'vue'
import { renderWithQiankun, qiankunWindow } from 'vite-plugin-qiankun/dist/helper'
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

// main.ts
function render(props: any) {
  const { container } = props
  const c = container ? container.querySelector('#app') : document.getElementById('app')
  app.mount(c)
}
renderWithQiankun({
  mount(props) {
    console.log('vue3sub mount')
    render(props)
  },
  bootstrap() {
    console.log('bootstrap')
  },
  unmount(props: any) {
    console.log('vue3sub unmount')
    app.unmount()
  },
  update(props: any) {
    console.log('vue3sub update')
    console.log(props)
  },
})

// eslint-disable-next-line no-underscore-dangle
if (!qiankunWindow.__POWERED_BY_QIANKUN__) {
  render({})
}
