<template lang="pug">
a-form(:model="settingsForm" layout="vertical")
  a-form-item(:label="$t('settings.host')")
    a-input(v-model="settingsForm.host")
  a-form-item(:label="$t('settings.database')")
    a-input(v-if="isCloud" v-model="settingsForm.database")
    a-select(v-else v-model="settingsForm.database")
      a-option(v-for="item of settingsForm.databaseList" :key="item" :value="item" :label="item")
  a-form-item(:label="$t('settings.username')")
    a-input(v-model="settingsForm.username")
  a-form-item(:label="$t('settings.password')")
    a-input-password(v-model="settingsForm.password")
</template>

<script lang="ts" setup name="SettingsForm">
  import { useAppStore } from '@/store'

  const { host, databaseList, database, isCloud, username, password } = storeToRefs(useAppStore())

  const settingsForm = ref({
    username,
    password,
    host,
    databaseList,
    database,
  })
</script>

<style scoped lang="less"></style>
