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
  import GlobalSetting from '@/components/global-setting/index.vue'
  import GuideModal from '@/components/guide-modal/index.vue'
  import useLocale from '@/hooks/locale'
  import { useUserStore, useAppStore } from '@/store'

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
  const { isCloud, guideModal } = storeToRefs(useAppStore())
  const { fetchDatabases, setDefaultDatabase } = useAppStore()
  // TODO: is there a better way to do this?
  if (import.meta.env.MODE === 'development' || import.meta.env.MODE === 'production') {
    fetchDatabases('dev')
  } else {
    isCloud.value = true
    setRole('cloud')
  }
</script>
