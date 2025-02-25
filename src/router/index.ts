import { createRouter, createWebHashHistory, createWebHistory } from 'vue-router'
import NProgress from 'nprogress' // progress bar
import 'nprogress/nprogress.css'

import { appRoutes } from './routes'
import { REDIRECT_MAIN, NOT_FOUND_ROUTE } from './routes/base'
import createRouteGuard from './guard'
import client from './routes/client'

NProgress.configure({ showSpinner: false }) // NProgress Configuration

const extractContextPath = (path: string): string => {
  // Find the index of 'dashboard'
  const dashboardIndex = path.lastIndexOf('/dashboard')

  if (dashboardIndex === -1) {
    return '' // Return empty string if 'dashboard' is not found
  }

  // Extract the substring up to 'dashboard'
  const contextPath = path.substring(0, dashboardIndex + 1)

  return contextPath
}

const router = createRouter({
  history: createWebHashHistory(extractContextPath(window.location.pathname)),
  routes: [
    {
      path: '/',
      redirect: '/dashboard/query',
    },
    ...appRoutes,
    client,
    REDIRECT_MAIN,
    NOT_FOUND_ROUTE,
  ],
  scrollBehavior() {
    return { top: 0 }
  },
})

createRouteGuard(router)

export default router
