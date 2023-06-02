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
  scrollBehavior(to, from, savedPosition) {
    return new Promise((resolve, reject) => {
      setTimeout(() => {
        if (savedPosition) {
          resolve(savedPosition)
        }
        if (to.hash) {
          resolve({
            el: to.hash,
          })
        }
        resolve({ top: 0 })
      }, 0)
    })
  },
})

createRouteGuard(router)

router.beforeEach(async (to, from, next) => {
  try {
    // TODO: Is it necessary to decide this every time we go to a new route?
    const appStore = useAppStore()
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
      appStore.updateSettings(config)
      delete to.query.info
      return next({ path: to.path, query: to.query })
    }
    appStore.updateSettings(useStorage('config', {}).value)
  } catch (error) {
    // error
  }
  return next()
})

export default router
