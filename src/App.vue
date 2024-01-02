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
  import useLocale from '@/hooks/locale'
  import { useUserStore, useAppStore } from '@/store'
  import { useStorage } from '@vueuse/core'

  const { currentLocale } = useLocale()
  const locale = computed(() => {
    switch (currentLocale.value) {
      case 'en-US':
        return enUS
      default:
        return enUS
    }
  })

  const { setRole } = useUserStore()
  const { host, username, password, database, guideModalVisible } = storeToRefs(useAppStore())
  const { fetchDatabases, updateSettings } = useAppStore()
  const { getScriptsTable } = useDataBaseStore()

  host.value = window.location.origin

  const role = import.meta.env.VITE_ROLE || 'admin'
  setRole(role)

  if (role === 'playground') {
    updateSettings({ navbar: false })
  }

  if (import.meta.env.MODE === 'development' || import.meta.env.MODE === 'production') {
    // Assuming local greptimeDB is up and running
    fetchDatabases()
  }
</script>
