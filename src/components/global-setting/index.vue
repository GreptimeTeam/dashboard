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
    a-form-item(
      :validate-status="isValidTimezone ? undefined : 'error'"
      :help="isValidTimezone ? undefined : $t('settings.timezoneInvalid')"
    )
      template(#label)
        a-space(:size="4")
          span {{ $t('settings.timezone') }}
          a-tooltip(mini position="tl" :content="$t('settings.timezoneTip')")
            svg.icon-12
              use(href="#question")
      TimezoneSelect(v-model="settingsForm.userTimezone")
      template(#extra)
        div
          | {{ $t('settings.timezoneExtra') }}
          a-link(icon href="https://en.wikipedia.org/wiki/List_of_tz_database_time_zones" target="_blank") IANA
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
  import { useAppStore, useDataBaseStore } from '@/store'
  import { isValidTimezoneSetting } from '@/utils/timezone'
  import TimezoneSelect from '@/components/timezone-select/index.vue'

  const MARGIN_BOTTOM = `${38 * 2 + 8}px`

  const appStore = useAppStore()
  const { checkTables } = useDataBaseStore()

  const { globalSettings, host, database, username, password, databaseList, userTimezone, authHeader } =
    storeToRefs(appStore)

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

  const checkTimezoneInput = (tz: string): boolean => {
    isValidTimezone.value = isValidTimezoneSetting(tz ?? '')
    return isValidTimezone.value
  }

  watch(
    () => settingsForm.value.userTimezone,
    (tz) => checkTimezoneInput(tz)
  )

  const save = async () => {
    if (!checkTimezoneInput(settingsForm.value.userTimezone)) {
      return
    }
    const tz = settingsForm.value.userTimezone?.trim() || ''
    settingsForm.value.userTimezone = tz

    loginLoading.value = true
    const res = await appStore.validateAndSaveConnection(settingsForm.value)
    if (res) {
      loginStatus.value = 'success'

      await appStore.refreshDatabaseList()
      settingsForm.value.databaseList = databaseList.value
      settingsForm.value.database = database.value
      checkTables()

      setTimeout(() => {
        appStore.closeGlobalSettings()
      }, 3000)
    } else {
      loginStatus.value = 'fail'
    }
    loginLoading.value = false
  }

  const setVisible = () => {
    appStore.openGlobalSettings()
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
      isValidTimezone.value = true
    }
  })

  onMounted(async () => {
    await appStore.ensureConnectionHost()
    const res = await appStore.refreshDatabaseList()
    settingsForm.value.databaseList = databaseList.value
    settingsForm.value.database = database.value

    if (res) {
      const loginSuccess = await appStore.validateAndSaveConnection()
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
    try {
      await appStore.refreshDatabaseList(settingsForm.value.host)
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
      border-radius: var(--gpt-radius-sm);
      box-shadow: 0 4px 10px 0 var(--border-color);
      border: 1px solid var(--border-color);
      .arco-form-item-label-col {
        margin-bottom: 5px;
        > .arco-form-item-label {
          color: var(--gpt-text-label);
          font-size: 13px;
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
      font-size: 11px;
      padding: 0 2px;
      .arco-link-icon {
        font-size: 11px;
        margin-right: 1px;
      }
    }
  }
</style>
