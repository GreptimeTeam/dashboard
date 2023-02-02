import { CrossStorageClient } from 'cross-storage'
import { createRouter, createWebHistory } from 'vue-router'
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
      redirect: 'dashboard/sql',
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

function getConfig() {
  return new Promise((resolve, reject) => {
    const storage = new CrossStorageClient('https://dev.greptime-cloud-frontend.pages.dev', {})
    storage
      .onConnect()
      .then(() => {
        return storage.get(document.location.host)
      })
      .then((res) => {
        return resolve(res)
      })
      .catch((err) => {
        return reject()
      })
  })
}

router.beforeEach(async (to, from, next) => {
  try {
    // TODO: Is it necessary to decide this every time we go to a new route?
    const appStore = useAppStore()
    if (appStore.isCloud) {
      const res = await getConfig()
      appStore.updateSettings({
        ...JSON.parse(res as string),
      })
    }
  } catch (error) {
    console.log(`error:`, error)
  }
  next()
})

export default router
