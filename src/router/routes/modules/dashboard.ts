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
        icon: 'query-menu',
        roles: ['admin', 'cloud'],
      },
    },
    {
      path: 'tables',
      name: 'tables',
      redirect: '/dashboard/query',
      component: () => import('@/views/dashboard/query/index.vue'),
      meta: {
        locale: 'menu.dashboard.tables',
        requiresAuth: false,
        icon: 'query-menu',
        roles: ['admin', 'cloud'],
        hideInMenu: true,
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
            icon: 'influxdb',
            roles: ['admin', 'cloud'],
          },
          children: [
            {
              path: 'input',
              name: 'influxdb-input',
              component: () => import('@/views/dashboard/ingest/influxdb/input-influxdb.vue'),
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
              component: () => import('@/views/dashboard/ingest/influxdb/upload-influxdb.vue'),
              meta: {
                locale: 'menu.dashboard.upload',
                requiresAuth: false,
                roles: ['admin', 'cloud'],
                icon: 'upload',
              },
            },
          ],
        },
        {
          path: 'log-ingestion',
          name: 'log-ingestion',
          redirect: '/dashboard/ingest/log-ingestion/input',
          component: () => import('@/views/dashboard/ingest/log-ingestion/index.vue'),
          meta: {
            locale: 'menu.dashboard.log-ingestion',
            requiresAuth: false,
            icon: 'upload-logs',
            roles: ['admin', 'cloud'],
          },
          children: [
            {
              path: 'input',
              name: 'log-ingestion-input',
              component: () => import('@/views/dashboard/ingest/log-ingestion/input-log-ingestion.vue'),
              meta: {
                locale: 'menu.dashboard.input',
                requiresAuth: false,
                roles: ['admin', 'cloud'],
                icon: 'input',
              },
            },
            {
              path: 'upload',
              name: 'log-ingestion-upload',
              component: () => import('@/views/dashboard/ingest/log-ingestion/upload-log-ingestion.vue'),
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
      path: 'log-query',
      redirect: '/dashboard/logs-query',
      component: () => import('@/views/dashboard/logs/query/index.vue'),
      meta: {
        ignoreCache: true,
        locale: 'menu.dashboard.logsQuery',
        requiresAuth: false,
        icon: 'log',
        roles: ['admin', 'cloud'],
        hideInMenu: true,
      },
    },
    {
      path: 'logs-query',
      component: () => import('@/views/dashboard/logs/query/index.vue'),
      name: 'log-query',
      meta: {
        ignoreCache: true,
        locale: 'menu.dashboard.logsQuery',
        requiresAuth: false,
        icon: 'log',
        roles: ['admin', 'cloud'],
      },
    },
    {
      path: 'log-pipeline',
      redirect: '/dashboard/logs-pipelines',
      component: () => import('@/views/dashboard/logs/pipelines/index.vue'),
      meta: {
        locale: 'menu.dashboard.logPipeline',
        requiresAuth: false,
        roles: ['admin', 'cloud'],
        icon: 'configuration',
        hideInMenu: true,
      },
    },
    {
      path: 'logs-pipelines',
      name: 'log-pipeline',
      component: () => import('@/views/dashboard/logs/pipelines/index.vue'),
      meta: {
        locale: 'menu.dashboard.logPipeline',
        requiresAuth: false,
        roles: ['admin', 'cloud'],
        icon: 'configuration',
      },
    },
    {
      path: 'traces',
      component: () => import('@/views/dashboard/traces/index.vue'),
      name: 'trace-query',
      meta: {
        ignoreCache: false,
        locale: 'menu.traces.list',
        requiresAuth: false,
        icon: 'traces',
        roles: ['admin', 'cloud'],
        keepAlive: true,
      },
    },
    {
      path: 'traces/detail/:id',
      name: 'dashboard-TraceDetail',
      component: () => import('@/views/dashboard/traces/[id].vue'),
      meta: {
        locale: 'menu.traces.detail',
        requiresAuth: false,
        roles: ['admin', 'cloud'],
        hideInMenu: true,
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
