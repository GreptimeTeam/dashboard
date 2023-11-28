<template lang="pug">
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
</template>

<script lang="ts" setup name="SettingsForm">
  import { useAppStore } from '@/store'

  const { role } = storeToRefs(useUserStore())
  const { host, databaseList, database, username, password } = storeToRefs(useAppStore())

  // TODO: props?
  const settingsForm = ref({
    username: username.value,
    password: password.value,
    host: host.value,
    databaseList,
    database: database.value,
  })
</script>

<style scoped lang="less"></style>
