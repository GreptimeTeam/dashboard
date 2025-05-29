import { DEFAULT_LAYOUT } from '../base'
import { AppRouteRecordRaw } from '../types'

const TRACES: AppRouteRecordRaw = {
  path: '/traces',
  name: 'traces',
  component: DEFAULT_LAYOUT,
  meta: {
    locale: 'menu.traces',
    requiresAuth: true,
    icon: 'icon-code',
    order: 3,
  },
  children: [
    {
      path: '',
      name: 'TraceList',
      component: () => import('@/views/dashboard/traces/index.vue'),
      meta: {
        locale: 'menu.traces.list',
        requiresAuth: true,
        roles: ['*'],
      },
    },
    {
      path: ':id',
      name: 'TraceDetail',
      component: () => import('@/views/dashboard/traces/[id].vue'),
      meta: {
        locale: 'menu.traces.detail',
        requiresAuth: true,
        roles: ['*'],
        hideInMenu: true,
      },
    },
  ],
}

export default TRACES
