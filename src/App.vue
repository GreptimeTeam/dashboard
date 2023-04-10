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
  const { isCloud, host } = storeToRefs(useAppStore())
  const { fetchDatabases } = useAppStore()
  host.value = window.location.origin
  // TODO: is there a better way to do this?
  if (import.meta.env.MODE === 'development' || import.meta.env.MODE === 'production') {
    fetchDatabases('notCloud')
  } else {
    isCloud.value = true
    setRole('cloud')
  }
</script>
