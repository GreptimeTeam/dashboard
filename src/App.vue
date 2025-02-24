<template>
  <a-config-provider :locale="locale">
    <router-view />
    <guide-modal />
    <global-setting />
  </a-config-provider>
</template>

<script lang="ts" setup>
  import { computed } from 'vue'
  import enUS from '@arco-design/web-vue/es/locale/lang/en-us'
  import zhCN from '@arco-design/web-vue/es/locale/lang/zh-cn'
  import useLocale from '@/hooks/locale'
  import { useUserStore, useAppStore } from '@/store'
  import { useStorage } from '@vueuse/core'
  import { invoke, isTauri } from '@tauri-apps/api/core'
  import { getCurrentWindow } from '@tauri-apps/api/window'

  const { currentLocale } = useLocale()
  const locale = computed(() => {
    switch (currentLocale.value) {
      case 'en-US':
        return enUS
      case 'zh-CN':
        return zhCN
      default:
        return enUS
    }
  })

  const { setRole } = useUserStore()
  const { updateSettings } = useAppStore()

  const role = import.meta.env.VITE_ROLE || 'admin'
  setRole(role)

  if (role === 'playground') {
    updateSettings({ navbar: false })
  }

  if (import.meta.env.MODE === 'development' || import.meta.env.MODE === 'production') {
    // Assuming local greptimeDB is up and running
    const { username, password, database, host, authHeader }: any = useStorage('config', {}).value
    updateSettings({
      username,
      password,
      database,
      host,
      authHeader,
    })
  }

  onMounted(async () => {
    try {
      const isTauriEnv = await isTauri()
      console.log(isTauriEnv)
      if (isTauriEnv) {
        const appWindow = getCurrentWindow()
        if (appWindow.label === 'main') {
          import('@/tauri/index')
          await invoke('plugin:app|is_running')
        }
        console.log('Running in Tauri environment')
      }
    } catch (e) {
      console.log('Not running in Tauri environment')
    }
  })
</script>
