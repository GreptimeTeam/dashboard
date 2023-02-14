<template lang="pug">
a-form(:model="settingsForm" layout="vertical")
  a-form-item(:label="$t('settings.username')")
    a-input(v-model="settingsForm.principal")
  a-form-item(:label="$t('settings.password')")
    a-input(v-model="settingsForm.credential")
  a-form-item(:label="$t('settings.databaseURL')")
    a-input(v-model="settingsForm.databaseURL")
  a-form-item(:label="$t('settings.database')")
    a-input(v-if="isCloud" v-model="settingsForm.database")
    a-select(v-else v-model="settingsForm.database")
      a-option(v-for="item of settingsForm.databaseList" :key="item" :value="item" :label="item")
</template>

<script lang="ts" setup name="SettingsForm">
  import { useAppStore } from '@/store'

  const { databaseURL, databaseList, database, isCloud, principal, credential } = storeToRefs(useAppStore())

  const settingsForm = ref({
    principal,
    credential,
    databaseURL,
    databaseList,
    database,
  })
</script>

<style scoped lang="less"></style>
