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
  const { isCloud, host, username, password, database, guideModalVisible, codeType } = storeToRefs(useAppStore())
  const { fetchDatabases, updateSettings } = useAppStore()
  const { getTables, getScriptsTable } = useDataBaseStore()

  host.value = window.location.origin
  // TODO: is there a better way to do this?
  if (import.meta.env.MODE === 'development' || import.meta.env.MODE === 'production') {
    // Assuming local greptimeDB is up and running
    fetchDatabases()
  } else {
    isCloud.value = true
    setRole('cloud')
  }

  // Update settings with local storage info
  updateSettings(useStorage('config', {}).value)

  if (!isCloud.value || !username.value || !password.value || !database.value) {
    guideModalVisible.value = true
  } else {
    getTables()
    if (codeType.value === 'python') {
      getScriptsTable()
    }
  }
</script>
