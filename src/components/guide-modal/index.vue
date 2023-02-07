<template>
  <a-modal
    v-model:visible="guideModal"
    :mask-closable="false"
    ok-text="Ok"
    :hide-cancel="true"
    :closable="false"
    @ok="handleOk"
  >
    <template #title> Welcome! </template>
    <a-form :model="guideForm">
      <a-form-item field="database" label="Database">
        <a-select v-model="guideForm.database" :disabled="isCloud">
          <a-option v-for="item of databaseList" :key="item" :value="item" :label="item"></a-option>
        </a-select>
      </a-form-item>
    </a-form>
  </a-modal>
</template>

<script lang="ts" setup>
  import { useAppStore } from '@/store'

  const { database, databaseList, codeType, isCloud, guideModal } = storeToRefs(useAppStore())
  const { fetchDataBaseTables, fetchScriptsTable } = useDataBaseStore()

  const guideForm = ref({
    database,
  })

  const handleOk = () => {
    if (codeType.value === 'sql') {
      fetchDataBaseTables()
    } else {
      fetchScriptsTable()
    }
    guideModal.value = false
  }
</script>

<style scoped lang="less"></style>
