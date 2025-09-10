<template lang="pug">
.fixed-settings(v-if="false" @click="setVisible")
  a-button(type="primary")
    template(#icon)
      icon-settings
a-drawer.settings-drawer(
  v-model:visible="globalSettings"
  unmount-on-close
  placement="left"
  :width="323"
  :mask-closable="true"
  :footer="false"
  :drawer-style="{ bottom: MARGIN_BOTTOM }"
)
  a-form(layout="vertical" :model="settingsForm")
    a-form-item(:label="$t('settings.host')")
      a-input(v-model="settingsForm.host")
    a-form-item
      template(#label)
        .label-with-button
          span {{ $t('settings.database') }}
          a-button.refresh-button(
            type="text"
            size="mini"
            :loading="databasesLoading"
            @click="refreshDatabases"
          )
            template(#icon)
              svg.icon
                use(href="#refresh")
      a-select(
        v-model="settingsForm.database"
        allow-create
        :trigger-props="{ autoFitPopupMinWidth: true }"
        :loading="databasesLoading"
      )
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
    a-form-item(v-if="settingsForm.username || settingsForm.password")
      template(#label)
        a-space(:size="4")
          span {{ $t('settings.authHeader') }}
          a-tooltip(mini position="tl" :content="$t('settings.authHeaderTip')")
            svg.icon-12
              use(href="#question")
      a-select(v-model="settingsForm.authHeader")
        a-option(value="Authorization") Authorization(default)
        a-option(value="x-greptime-auth") x-greptime-auth
    a-form-item
      template(#label)
        a-space(:size="4")
          span {{ $t('settings.timezone') }}
          a-tooltip(content="Used as x-greptime-timezone HTTP header" mini position="tl")
            svg.icon-12
              use(href="#question")
      a-input(
        v-model="settingsForm.userTimezone"
        allow-clear
        placeholder="±[h]h:mm or timezone name"
        :error="!isValidTimezone"
      )
      template(#extra)
        div
          | Use DST offsets from UTC, such as
          span.bold {{ ` -07:00. ` }}
          | Or a timezone name, such as
          span.bold {{ ` US/Pacific. ` }}
          | See more at
          a-link(icon href="https://en.wikipedia.org/wiki/List_of_tz_database_time_zones" target="_blank") Wiki.
    a-form-item.save
      a-button(
        type="primary"
        long
        :loading="loginLoading"
        @click="save()"
      ) {{ $t('settings.save') }}
      template(#extra)
        span.danger-color(v-if="loginStatus === 'fail'") {{ $t('settings.saveTip') }}
        span.success-color(v-if="loginStatus === 'success'")
          icon-check-circle
          | {{ $t('settings.saveSuccess') }}
</template>

<script lang="ts" setup name="GlobalSetting">
  import { useI18n } from 'vue-i18n'
  import { useAppStore, useDataBaseStore } from '@/store'
  import axios from 'axios'
  import { isTauri } from '@tauri-apps/api/core'
  import dayjs from 'dayjs'

  const MARGIN_BOTTOM = `${38 * 2 + 8}px`
  const { t } = useI18n()

  const { updateSettings, login, updateConfigStorage, fetchDatabases } = useAppStore()
  const { checkTables, getScriptsTable } = useDataBaseStore()

  const { role } = storeToRefs(useUserStore())
  const { globalSettings, host, database, username, password, databaseList, userTimezone, authHeader } = storeToRefs(
    useAppStore()
  )

  const loginStatus = ref('')
  const loginLoading = ref(false)
  const databasesLoading = ref(false)
  const isValidTimezone = ref(true)

  const settingsForm = ref({
    username: username.value,
    password: password.value,
    host: host.value,
    databaseList,
    database: database.value,
    userTimezone: userTimezone.value,
    authHeader: authHeader.value,
  })

  const checkTimezone = (tz: string): boolean => {
    if (!tz.trim()) {
      isValidTimezone.value = true
      return true
    }

    // ±[h]h:mm
    const offsetRegex = /^([+-])(\d|0\d|1[0-4]):(00|15|30|45)$/
    if (offsetRegex.test(tz)) {
      isValidTimezone.value = true
      return true
    }

    try {
      dayjs().tz(tz)
      isValidTimezone.value = true
      return true
    } catch (e) {
      isValidTimezone.value = false
      return false
    }
  }

  const save = async () => {
    if (!checkTimezone(settingsForm.value.userTimezone)) {
      return
    }
    updateSettings({ userTimezone: settingsForm.value.userTimezone })

    axios.defaults.baseURL = settingsForm.value.host
    loginLoading.value = true
    const res = await login(settingsForm.value)
    if (res) {
      loginStatus.value = 'success'
      checkTables()
      setTimeout(() => {
        updateSettings({
          globalSettings: false,
        })
      }, 3000)
    } else {
      loginStatus.value = 'fail'
    }
    loginLoading.value = false
  }

  const setVisible = () => {
    updateSettings({ globalSettings: true })
  }

  watch(globalSettings, () => {
    if (globalSettings.value) {
      settingsForm.value = {
        username: username.value,
        password: password.value,
        host: host.value,
        databaseList: databaseList.value,
        database: database.value,
        userTimezone: userTimezone.value,
        authHeader: authHeader.value || 'Authorization',
      }
      loginStatus.value = ''
    }
  })

  onMounted(async () => {
    if (!host.value) {
      const tauriEnv = isTauri()
      if (tauriEnv) {
        host.value = 'http://localhost:4000'
      } else {
        const { origin, pathname } = window.location
        const index = pathname.lastIndexOf('/dashboard')
        if (index !== -1) {
          host.value = `${origin}${pathname.slice(0, index)}`
        } else {
          host.value = `${origin}${pathname}`
        }
      }
      updateConfigStorage({ host: host.value })
    }
    axios.defaults.baseURL = host.value
    const res = await fetchDatabases()
    settingsForm.value.databaseList = databaseList.value
    settingsForm.value.database = database.value

    if (res) {
      const loginSuccess = await login({})
      if (loginSuccess) {
        loginStatus.value = 'success'
        checkTables()
      } else {
        loginStatus.value = 'fail'
      }
    }
  })

  const refreshDatabases = async () => {
    databasesLoading.value = true
    axios.defaults.baseURL = settingsForm.value.host
    try {
      await fetchDatabases()
      settingsForm.value.databaseList = databaseList.value
      settingsForm.value.database = database.value
    } finally {
      databasesLoading.value = false
    }
  }
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

  .label-with-button {
    display: flex;
    align-items: center;
    justify-content: space-between;
    width: 100%;

    .refresh-button {
      margin-left: 4px;
      padding: 0;
      font-size: 14px;
    }
  }
</style>

<style lang="less">
  .settings-drawer {
    .arco-drawer {
      height: auto;
      margin-left: 18px;
      border-radius: 4px;
      box-shadow: 0 4px 10px 0 var(--border-color);
      border: 1px solid var(--border-color);
      .arco-form-item-label-col {
        margin-bottom: 5px;
        > .arco-form-item-label {
          color: var(--main-font-color);
          font-size: 13px;
          opacity: 1;
        }
      }
      .arco-form-item {
        margin-bottom: 10px;
        &.save {
          .arco-form-item-extra {
            font-size: 12px;
          }
        }
      }
      .arco-drawer-header {
        display: none;
      }

      .arco-drawer-body {
        padding: 16px 16px 10px 16px;
      }
    }
    .bold {
      font-weight: 600;
    }
    .arco-form-item-extra {
      font-size: 11px;
    }
    .arco-link {
      margin-left: 2px;
      color: var(--brand-color);
      font-size: 11px;
      padding: 0 2px;
      .arco-link-icon {
        font-size: 11px;
        margin-right: 1px;
      }
    }
  }
</style>
