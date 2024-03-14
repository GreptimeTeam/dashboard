<template lang="pug">
.fixed-settings(v-if="false" @click="setVisible")
  a-button(type="primary")
    template(#icon)
      icon-settings
a-drawer.settings-drawer(
  unmount-on-close
  placement="left"
  :width="323"
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
    a-form-item
      template(#label)
        a-space(:size="4")
          span {{ $t('settings.timezone') }}
          a-tooltip(content="Used as x-greptime-timezone HTTP header" mini position="tl")
            svg.icon-12
              use(href="#question")
      a-input(v-model="settingsForm.userTimezone" allow-clear placeholder="±[h]h:mm or timezone name")
      template(#extra)
        div
          | Use DST offsets from UTC, such as
          span.bold {{ ` -07:00. ` }}
          | Or a timezone name, such as
          span.bold {{ ` US/Pacific. ` }}
          | See more at
          a-link(icon href="https://en.wikipedia.org/wiki/List_of_tz_database_time_zones" target="_blank") Wiki.
</template>

<script lang="ts" setup name="GlobalSetting">
  import { useI18n } from 'vue-i18n'
  import { useAppStore, useDataBaseStore } from '@/store'
  import axios from 'axios'

  const MARGIN_BOTTOM = `${38 * 2 + 8}px`
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
    userTimezone: userTimezone.value, // America/Chicago
  })

  const cancel = async () => {
    // TODO: check userTimezone format validation
    updateSettings({ globalSettings: false, userTimezone: settingsForm.value.userTimezone })
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
    if (globalSettings.value) {
      settingsForm.value = {
        username: username.value,
        password: password.value,
        host: host.value,
        databaseList: databaseList.value,
        database: database.value,
        userTimezone: userTimezone.value,
      }
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
