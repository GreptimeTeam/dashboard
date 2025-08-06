<template lang="pug">
a-drawer(
  v-if="currRow"
  popup-container="#log-table-container"
  ok-text="Close"
  :width="800"
  :visible="props.visible"
  :mask="false"
  :hide-cancel="true"
  @ok="handleOk"
  @cancel="handleCancel"
)
  template(#title)
    a-space
      a-button(type="text" :disabled="selectedRowKey === 0" @click="handlePre")
        icon-arrow-up
      a-button(type="text" :disabled="selectedRowKey === rows.length - 1" @click="handleNext")
        icon-arrow-down
  a-tabs
    a-tab-pane(title="Fields" key="1")
      FormView(:data="viewRow" :columns="columns")
    a-tab-pane(title="JSON" key="2")
      JSONView(:jsonStr="JSON.stringify(viewRow, null, 2)")
</template>

<script setup lang="ts" name="LogDetail">
  import type { ColumnType } from '@/types/query'
  import JSONView from './JSONView.vue'
  import FormView from './FormView.vue'

  const props = defineProps<{
    visible: boolean
    selectedRowKey: number | null
    currRow: any
    rows: any[]
    columns: ColumnType[]
  }>()
  const emit = defineEmits(['update:visible', 'update:selectedRowKey'])
  const handleOk = () => {
    emit('update:visible', false)
  }
  const handleCancel = () => {
    emit('update:visible', false)
  }

  const viewRow = computed(() => {
    const obj = { ...props.currRow }
    delete obj.index
    return obj
  })

  const handlePre = () => {
    emit('update:selectedRowKey', props.selectedRowKey - 1)
  }

  const handleNext = () => {
    emit('update:selectedRowKey', props.selectedRowKey + 1)
  }
</script>

<style lang="less">
  // Global styles for drawer since it's rendered in a portal
  #log-table-container .arco-drawer {
    border: 1px solid var(--color-neutral-3) !important;
  }
</style>
