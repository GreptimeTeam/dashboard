import { AppRouteRecordRaw } from '../types'

export const DEFAULT_LAYOUT = () => import('@/layout/default-layout.vue')

const DASHBOARD: AppRouteRecordRaw = {
  path: '/dashboard',
  name: 'dashboard',
  redirect: 'dashboard/sql',
  component: DEFAULT_LAYOUT,
  meta: {
    locale: 'menu.dashboard',
    requiresAuth: false,
    icon: 'icon-dashboard',
    roles: ['*'],
    order: 0,
  },
  children: [
    {
      path: 'sql',
      name: 'sql',
      component: () => import('@/views/dashboard/data-explorer/index.vue'),
      meta: {
        locale: 'menu.dashboard',
        requiresAuth: false,
        roles: ['*'],
      },
    },
    {
      path: 'scripts',
      name: 'scripts',
      component: () => import('@/views/dashboard/scripts/index.vue'),
      meta: {
        locale: 'menu.dashboard.scripts',
        requiresAuth: false,
        roles: ['*'],
      },
    },
  ],
}

export default DASHBOARD
