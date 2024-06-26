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
  const { host } = storeToRefs(useAppStore())
  const { updateSettings } = useAppStore()

  host.value = window.location.origin

  const role = import.meta.env.VITE_ROLE || 'admin'
  setRole(role)

  if (role === 'playground') {
    updateSettings({ navbar: false })
  }

  if (import.meta.env.MODE === 'development' || import.meta.env.MODE === 'production') {
    // Assuming local greptimeDB is up and running
    const { username, password, database }: any = useStorage('config', {}).value
    updateSettings({
      username,
      password,
      database,
    })
  }
</script>
