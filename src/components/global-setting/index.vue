<template lang="pug">
.fixed-settings(v-if="false" @click="setVisible")
  a-button(type="primary")
    template(#icon)
      icon-settings
a-drawer.settings-drawer(
  unmount-on-close
  placement="left"
  :width="262"
  :visible="globalSettings"
  :mask-closable="true"
  :footer="false"
  :drawer-style="{ bottom: MARGIN_BOTTOM }"
  @cancel="cancel"
)
  a-form(layout="vertical" :model="settingsForm")
    a-form-item(:label="$t('settings.host')")
      a-input(v-model="settingsForm.host")
    a-form-item(:label="$t('settings.database')")
      a-input(v-if="role !== 'admin'" v-model="settingsForm.database")
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
    a-form-item(:label="$t('settings.timezone')")
      a-select(v-model="settingsForm.userTimezone")
        //- a-option(
        //-   v-for="item of timezones"
        //-   :key="item"
        //-   :value="item"
        //-   :label="item"
        //- )
</template>

<script lang="ts" setup name="GlobalSetting">
  import { useI18n } from 'vue-i18n'
  import { useAppStore, useDataBaseStore } from '@/store'
  import axios from 'axios'
  import dayjs from 'dayjs'
  import utc from 'dayjs/plugin/utc'
  import timezone from 'dayjs/plugin/timezone'

  dayjs.extend(utc)
  dayjs.extend(timezone)

  const MARGIN_BOTTOM = `${44 * 2 + 1}px`
  const emit = defineEmits(['cancel'])

  const { t } = useI18n()

  const { navbar, updateSettings, login } = useAppStore()
  const { getScriptsTable, checkTables } = useDataBaseStore()

  const { role } = storeToRefs(useUserStore())
  const { codeType, globalSettings, host, database, username, password, databaseList, userTimezone } = storeToRefs(
    useAppStore()
  )

  const settingsForm = ref({
    username: username.value,
    password: password.value,
    host: host.value,
    databaseList,
    database: database.value,
    userTimezone: dayjs.tz.guess(), // America/Chicago
  })
  console.log('settingsForm', dayjs.tz.guess())

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
        checkTables()
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

  watch(globalSettings, () => {
    dayjs.tz.setDefault('America/Chicago')
    console.log(dayjs.tz(dayjs()).utcOffset() / 60)
    // dayjs.tz.setDefault('Asia/Shanghai')
    // console.log(dayjs.tz(dayjs()).utcOffset() / 60)
    if (globalSettings.value) {
      settingsForm.value = {
        username: username.value,
        password: password.value,
        host: host.value,
        databaseList: databaseList.value,
        database: database.value,
        userTimezone: userTimezone.value || dayjs.tz.name,
      }
      console.log('settingsForm', settingsForm.value)
    }
  })

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

<style lang="less">
  .settings-drawer {
    .arco-drawer {
      height: min-content;
      margin-left: 24px;
      border-radius: 4px;
      box-shadow: 0 4px 10px 0 var(--border-color);
      .arco-form-item {
        margin-bottom: 16px;
      }
      .arco-drawer-header {
        display: none;
      }

      .arco-drawer-body {
        padding: 16px 10px;
      }
    }
  }
</style>
