<template lang="pug">
a-modal.guide-modal(v-model:visible="guideModal" :mask-closable="false" :ok-text="$t('guide.confirm')" :hide-cancel="true" :closable="false" @ok="handleOk")
  template(#title)
    .
      {{ $t('guide.welcome')
      }}
    svg.guide-banner
      use(href="#banner")
  SettingsForm
  template(#footer)
</template>

<script lang="ts" setup>
  import { useAppStore } from '@/store'
  import SettingsForm from '../global-setting/settings-form.vue'

  const { database, databaseList, codeType, isCloud, guideModal } = storeToRefs(useAppStore())
  const { getTables, getScriptsTable } = useDataBaseStore()

  const guideForm = ref({
    database,
  })

  const handleOk = () => {
    if (codeType.value === 'sql') {
      getTables()
    } else {
      getScriptsTable()
    }
    guideModal.value = false
  }
</script>

<style scoped lang="less"></style>
