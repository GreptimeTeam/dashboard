import { createRouter, createWebHistory } from 'vue-router'
import { useStorage } from '@vueuse/core'
import NProgress from 'nprogress' // progress bar
import 'nprogress/nprogress.css'

import { appRoutes } from './routes'
import { REDIRECT_MAIN, NOT_FOUND_ROUTE } from './routes/base'
import createRouteGuard from './guard'

NProgress.configure({ showSpinner: false }) // NProgress Configuration

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/',
      redirect: 'dashboard/query',
    },
    ...appRoutes,
    REDIRECT_MAIN,
    NOT_FOUND_ROUTE,
  ],
  scrollBehavior() {
    return { top: 0 }
  },
})

createRouteGuard(router)

router.beforeEach(async (to, from, next) => {
  try {
    // TODO: Is it necessary to decide this every time we go to a new route?
    const appStore = useAppStore()
    if (appStore.isCloud) {
      appStore.updateSettings(useStorage('config', {}).value)
    }
  } catch (error) {
    console.log(`error:`, error)
  }
  next()
})

export default router
