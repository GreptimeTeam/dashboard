import { AppRouteRecordRaw } from '../types'

export const DEFAULT_LAYOUT = () => import('@/layout/default-layout.vue')

const DASHBOARD: AppRouteRecordRaw = {
  path: '/dashboard',
  name: 'dashboard',
  redirect: '/dashboard/query',
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
        locale: 'menu.dashboard.query',
        requiresAuth: false,
      },
    },
    {
      path: 'scripts',
      name: 'scripts',
      component: () => import('@/views/dashboard/scripts/index.vue'),
      meta: {
        locale: 'menu.dashboard.scripts',
        requiresAuth: true,
        roles: ['dev'],
      },
    },
    {
      path: 'playground',
      name: 'playground',
      component: () => import('@/views/dashboard/playground/index.vue'),
      meta: {
        locale: 'menu.dashboard.playground',
        requiresAuth: false,
      },
    },
    {
      path: 'status',
      name: 'status',
      component: () => import('@/views/dashboard/status/index.vue'),
      meta: {
        locale: 'menu.dashboard.status',
        requiresAuth: true,
        roles: ['dev'],
      },
    },
  ],
}

export default DASHBOARD
