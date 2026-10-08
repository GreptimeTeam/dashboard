/// <reference types="vite/client" />

declare module '*.vue' {
  import { DefineComponent } from 'vue'
  // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/ban-types
  const component: DefineComponent<{}, {}, any>
  export default component
}

declare module '*.svg' {
  import type { DefineComponent } from 'vue'

  const component: DefineComponent
  export default component
}

declare module '*.svg?url' {
  const url: string
  export default url
}
interface ImportMetaEnv {
  readonly VITE_API_BASE_URL: string
  readonly VITE_CLOUD_URL: string
}
