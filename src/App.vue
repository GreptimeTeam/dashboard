<template>
  <a-config-provider :locale="locale">
    <router-view />
    <global-setting />
  </a-config-provider>
</template>

<script lang="ts" setup>
  import { computed } from 'vue'
  import enUS from '@arco-design/web-vue/es/locale/lang/en-us'
  import GlobalSetting from '@/components/global-setting/index.vue'
  import useLocale from '@/hooks/locale'
  import { useUserStore } from '@/store'

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
  const { isCloud } = storeToRefs(useAppStore())
  const { fetchDatabases } = useAppStore()
  // TODO: is there a better way to do this?
  if (import.meta.env.MODE === 'cloud') {
    isCloud.value = true
    setRole('cloud')
  } else {
    isCloud.value = false
    setRole('dev')
    fetchDatabases()
  }
</script>
