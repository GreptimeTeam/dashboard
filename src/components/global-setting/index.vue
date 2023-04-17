<template lang="pug">
.fixed-settings(v-if="!navbar" @click="setVisible")
  a-button(type="primary")
    template(#icon)
      icon-settings
a-drawer(:width="262" unmount-on-close :visible="globalSettings" :mask-closable="true" @cancel="cancel" :footer="false" )
  template(#title)
    svg.drawer-icon 
      use(href="#setting2")
    | {{ $t('settings.title') }}
  SettingsForm.settings-form
</template>

<script lang="ts" setup>
  import { useI18n } from 'vue-i18n'
  import { useAppStore, useDataBaseStore } from '@/store'
  import axios from 'axios'
  import SettingsForm from './settings-form.vue'

  const emit = defineEmits(['cancel'])

  const { host, navbar, updateSettings } = useAppStore()
  const { getTables, getScriptsTable } = useDataBaseStore()

  const { t } = useI18n()
  const route = useRoute()

  const { globalSettings } = storeToRefs(useAppStore())

  // TODO: import AnyObject from global.ts
  const TABLES_MAP: { [key: string]: any } = {
    query: getTables,
    scripts: getScriptsTable,
  }

  const cancel = () => {
    updateSettings({ globalSettings: false })
    axios.defaults.baseURL = host
    if (route.name) {
      TABLES_MAP[route.name as string]?.()
    }

    emit('cancel')
  }

  const setVisible = () => {
    updateSettings({ globalSettings: true })
  }

  onMounted(() => {
    axios.defaults.baseURL = host
  })
</script>

<style scoped lang="less">
  .fixed-settings {
    position: fixed;
    top: 280px;
    right: 0;

    svg {
      font-size: 18px;
      vertical-align: -4px;
    }
  }
</style>
