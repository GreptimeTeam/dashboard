import { DEFAULT_LAYOUT } from '../base'
import { AppRouteRecordRaw } from '../types'

const DASHBOARD: AppRouteRecordRaw = {
  path: '/dashboard',
  name: 'dashboard',
  component: DEFAULT_LAYOUT,
  meta: {
    locale: 'menu.dashboard',
    requiresAuth: false,
    icon: 'icon-dashboard',
    order: 0,
  },
  children: [
    {
      path: 'workplace',
      name: 'Workplace',
      component: () => import('@/views/dashboard/workplace/index.vue'),
      meta: {
        locale: 'menu.dashboard.workplace',
        requiresAuth: false,
        roles: ['*'],
      },
    },
    {
      path: 'data-explorer',
      name: 'data-explorer',
      component: () => import('@/views/dashboard/data-explorer/index.vue'),
      meta: {
        locale: 'menu.dashboard.dataExplorer',
        requiresAuth: false,
        roles: ['*'],
      },
    },
  ],
}

export default DASHBOARD
