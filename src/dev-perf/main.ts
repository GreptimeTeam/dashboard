import { createApp } from 'vue'
import ArcoVue, { FormItem } from '@arco-design/web-vue'
import ArcoVueIcon from '@arco-design/web-vue/es/icon'
import { createPinia } from 'pinia'
import globalComponents from '@/components'
import '@/assets/icons'
import i18n from '@/locale'
import '@arco-design/web-vue/dist/arco.less'
import '@/assets/style/global.less'
import PerfHarness from './PerfHarness.vue'

// Dev-only entry (perf.html). Not part of the production build: createHtmlPlugin
// pins `build.rollupOptions.input` to index.html + dashboard.html.
FormItem.props.asteriskPosition.default = 'end'

createApp(PerfHarness)
  .use(createPinia())
  .use(ArcoVue)
  .use(ArcoVueIcon)
  .use(i18n)
  .use(globalComponents)
  .mount('#perf-root')
