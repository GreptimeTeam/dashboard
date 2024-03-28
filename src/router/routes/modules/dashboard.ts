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
      name: 'query',
      component: () => import('@/views/dashboard/query/index.vue'),
      meta: {
        locale: 'menu.dashboard.tables',
        requiresAuth: false,
        icon: 'query-menu',
        roles: ['admin', 'cloud'],
      },
    },
    {
      path: 'ingest',
      name: 'ingest',
      component: () => import('@/views/dashboard/ingest/index.vue'),
      redirect: '/dashboard/ingest/influxdb-line-protocol/input',
      meta: {
        locale: 'menu.dashboard.ingest',
        requiresAuth: false,
        icon: 'ingest',
        roles: ['admin', 'cloud'],
      },
      children: [
        {
          path: 'influxdb-line-protocol',
          name: 'influxdb',
          redirect: '/dashboard/ingest/influxdb-line-protocol/input',
          component: () => import('@/views/dashboard/ingest/influxdb/index.vue'),
          meta: {
            locale: 'menu.dashboard.influxdb',
            requiresAuth: false,
            icon: 'query-menu',
            roles: ['admin', 'cloud'],
          },
          children: [
            {
              path: 'input',
              name: 'influxdb-input',
              component: () => import('@/views/dashboard/ingest/influxdb/input.vue'),
              meta: {
                locale: 'menu.dashboard.input',
                requiresAuth: false,
                roles: ['admin', 'cloud'],
                icon: 'input',
              },
            },
            {
              path: 'upload',
              name: 'influxdb-upload',
              component: () => import('@/views/dashboard/ingest/influxdb/upload.vue'),
              meta: {
                locale: 'menu.dashboard.upload',
                requiresAuth: false,
                roles: ['admin', 'cloud'],
                icon: 'upload',
              },
            },
          ],
        },
      ],
    },
    {
      path: 'scripts',
      name: 'scripts',
      component: () => import('@/views/dashboard/scripts/index.vue'),
      meta: {
        locale: 'menu.dashboard.scripts',
        requiresAuth: true,
        icon: 'scripts',
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
