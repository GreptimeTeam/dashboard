<template lang="pug">
.fixed-settings(v-if="!navbar" @click="setVisible")
  a-button(type="primary")
    template(#icon)
      icon-settings
a-drawer(
  unmount-on-close
  :width="262"
  :visible="globalSettings"
  :mask-closable="true"
  :footer="false"
  @cancel="cancel"
)
  template(#title)
    svg.drawer-icon
      use(href="#setting2")
    | {{ $t('settings.title') }}
  SettingsForm.settings-form
</template>

<script lang="ts" setup name="GlobalSetting">
  import { useI18n } from 'vue-i18n'
  import { useAppStore, useDataBaseStore } from '@/store'
  import axios from 'axios'
  import { useStorage } from '@vueuse/core'

  const emit = defineEmits(['cancel'])

  const { navbar, updateSettings } = useAppStore()
  const { getTables, getScriptsTable } = useDataBaseStore()

  const { t } = useI18n()
  const route = useRoute()

  const { globalSettings, host, database, username, password } = storeToRefs(useAppStore())

  const cancel = async () => {
    updateSettings({ globalSettings: false })
    axios.defaults.baseURL = host.value
    const result = await getTables()
    if (result) {
      if (route.name === 'scripts') {
        getScriptsTable()
      }
      const config = { database: database.value, username: username.value, password: password.value }
      useStorage('config', config, localStorage, {
        mergeDefaults: (storageValue, defaults) => {
          return {
            ...storageValue,
            ...defaults,
          }
        },
      })
    }

    emit('cancel')
  }

  const setVisible = () => {
    updateSettings({ globalSettings: true })
  }

  onMounted(() => {
    axios.defaults.baseURL = host.value
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
