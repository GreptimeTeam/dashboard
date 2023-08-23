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
  a-form(layout="vertical" :model="settingsForm")
    a-form-item(:label="$t('settings.host')")
      a-input(v-model="settingsForm.host")
    a-form-item(:label="$t('settings.database')")
      a-input(v-if="isCloud" v-model="settingsForm.database")
      a-select(v-else v-model="settingsForm.database" allow-create)
        a-option(
          v-for="item of settingsForm.databaseList"
          :key="item"
          :value="item"
          :label="item"
        )
    a-form-item(:label="$t('settings.username')")
      a-input(v-model="settingsForm.username")
    a-form-item(:label="$t('settings.password')")
      a-input-password(v-model="settingsForm.password" autocomplete="off")
</template>

<script lang="ts" setup name="GlobalSetting">
  import { useI18n } from 'vue-i18n'
  import { useAppStore, useDataBaseStore } from '@/store'
  import axios from 'axios'
  import { useStorage } from '@vueuse/core'
  import editorAPI from '@/api/editor'

  const emit = defineEmits(['cancel'])

  const { t } = useI18n()
  const route = useRoute()

  const { navbar, updateSettings, login } = useAppStore()
  const { getTables, getScriptsTable } = useDataBaseStore()

  const { codeType, isCloud, globalSettings, host, database, username, password, databaseList } = storeToRefs(
    useAppStore()
  )

  const settingsForm = ref({
    username: username.value,
    password: password.value,
    host: host.value,
    databaseList,
    database: database.value,
  })

  const cancel = async () => {
    updateSettings({ globalSettings: false })
    axios.defaults.baseURL = settingsForm.value.host
    // Check if settings are changed
    if (
      settingsForm.value.username !== username.value ||
      settingsForm.value.password !== password.value ||
      settingsForm.value.database !== database.value ||
      settingsForm.value.host !== host.value
    ) {
      const res = await login(settingsForm.value)
      if (res) {
        getTables()
        if (codeType.value === 'python') {
          getScriptsTable()
        }
      }
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
