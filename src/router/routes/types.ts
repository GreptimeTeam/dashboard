import { defineComponent } from 'vue'
import type { NavigationGuard, RouteLocationRaw, RouteMeta } from 'vue-router'

export type Component<T = any> =
  | ReturnType<typeof defineComponent>
  | (() => Promise<typeof import('*.vue')>)
  | (() => Promise<T>)

export interface AppRouteRecordRaw {
  path: string
  name?: string | symbol
  meta?: RouteMeta
  redirect?: string | RouteLocationRaw | ((to: Parameters<NavigationGuard>[0]) => RouteLocationRaw)
  component: Component | string
  children?: AppRouteRecordRaw[]
  alias?: string | string[]
  props?: Record<string, any>
  beforeEnter?: NavigationGuard | NavigationGuard[]
  fullPath?: string
}
