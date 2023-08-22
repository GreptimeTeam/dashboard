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
      redirect: '/dashboard/query',
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
    // Will only happen in cloud (first time enter)
    if (to.query.info) {
      const config = JSON.parse(atob(to.query.info as string))
      useStorage('config', config, localStorage, {
        mergeDefaults: (storageValue, defaults) => {
          return {
            ...storageValue,
            ...defaults,
          }
        },
      })
      // Update setting with config from url
      appStore.updateSettings(config)
      delete to.query.info
      return next({ path: to.path, query: to.query })
    }
  } catch (error) {
    // error
  }
  return next()
})

export default router
