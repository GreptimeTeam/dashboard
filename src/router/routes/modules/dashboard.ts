import { AppRouteRecordRaw } from '../types'

const DASHBOARD: AppRouteRecordRaw = {
  path: '/dashboard',
  name: 'dashboard',
  component: () => import('@/views/dashboard/data-explorer/index.vue'),
  meta: {
    locale: 'menu.dashboard',
    requiresAuth: false,
    icon: 'icon-dashboard',
    roles: ['*'],
    order: 0,
  },
}

export default DASHBOARD
