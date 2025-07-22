import type { Router } from 'vue-router'
import NProgress from 'nprogress' // progress bar
import { useStorage } from '@vueuse/core'

export default function setupUserLoginInfoGuard(router: Router) {
  router.beforeEach(async (to, from, next) => {
    NProgress.start()

    if (from.matched?.[0]?.path === '/dashboard') {
      return next()
    }
    try {
      const appStore = useAppStore()
      // If there is info in URL (direct from cloud)
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
        // Update settings with config from URL
        appStore.updateSettings(config)
        delete to.query.info
        return next({ path: to.path, query: to.query })
      }

      // Update settings with config from local storage
      appStore.updateSettings(useStorage('config', {}).value)
    } catch (error) {
      // error
    }
    return next()
  })
}
