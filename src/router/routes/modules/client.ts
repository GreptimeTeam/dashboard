import ClientLayout from '@/tauri/layout.vue'
import { AppRouteRecordRaw } from '../types'

export default {
  path: '/client',
  name: 'ClientComponent',
  meta: {
    requiresAuth: false,
  },
  component: ClientLayout,
  children: [
    {
      path: 'about',
      name: 'clientAbout',
      component: () => import('@/tauri/about.vue'),
      meta: {
        requiresAuth: false,
      },
    },
  ],
} as AppRouteRecordRaw
