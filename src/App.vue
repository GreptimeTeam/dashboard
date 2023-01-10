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
  setRole(import.meta.env.MODE === 'cloud' ? 'cloud' : 'dev')
</script>
