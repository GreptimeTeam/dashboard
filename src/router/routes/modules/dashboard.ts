import { AppRouteRecordRaw } from '../types'

export const DEFAULT_LAYOUT = () => import('@/layout/default-layout.vue')

const DASHBOARD: AppRouteRecordRaw = {
  path: '/dashboard',
  name: 'dashboard',

  redirect: '/dashboard/tables',
  component: DEFAULT_LAYOUT,
  meta: {
    locale: 'menu.dashboard',
    requiresAuth: false,
    icon: 'icon-dashboard',
    order: 0,
  },
  children: [
    {
      path: 'tables',
      name: 'tables',
      component: () => import('@/views/dashboard/query/index.vue'),
      meta: {
        locale: 'menu.dashboard.tables',
        requiresAuth: false,
        icon: 'query-menu',
        roles: ['admin', 'cloud'],
      },
    },
    {
      path: 'scripts',
      name: 'scripts',
      component: () => import('@/views/dashboard/scripts/index.vue'),
      meta: {
        locale: 'menu.dashboard.scripts',
        requiresAuth: true,
        icon: 'folder-code',
        roles: ['admin'],
      },
    },
    {
      path: 'status',
      name: 'status',
      component: () => import('@/views/dashboard/status/index.vue'),
      meta: {
        locale: 'menu.dashboard.status',
        requiresAuth: true,
        icon: 'database-config',
        roles: ['admin'],
      },
    },
  ],
}

export default DASHBOARD
