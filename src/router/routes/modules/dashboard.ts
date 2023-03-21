import { AppRouteRecordRaw } from '../types'

export const DEFAULT_LAYOUT = () => import('@/layout/default-layout.vue')

const DASHBOARD: AppRouteRecordRaw = {
  path: '/dashboard',
  name: 'dashboard',
  redirect: 'dashboard/query',
  component: DEFAULT_LAYOUT,
  meta: {
    locale: 'menu.dashboard',
    requiresAuth: false,
    icon: 'icon-dashboard',
    order: 0,
  },
  children: [
    {
      path: 'query',
      name: 'query',
      component: () => import('@/views/dashboard/query/index.vue'),
      meta: {
        locale: 'menu.dashboard',
        requiresAuth: false,
      },
    },
    {
      path: 'scripts',
      name: 'scripts',
      component: () => import('@/views/dashboard/scripts/index.vue'),
      meta: {
        locale: 'menu.dashboard.scripts',
        requiresAuth: false,
        roles: ['dev'],
      },
    },
    {
      path: 'notebook',
      name: 'notebook',
      component: () => import('@/views/dashboard/notebook/index.vue'),
      meta: {
        locale: 'menu.dashboard.scripts',
        requiresAuth: false,
        roles: ['dev'],
      },
    },
  ],
}

export default DASHBOARD
