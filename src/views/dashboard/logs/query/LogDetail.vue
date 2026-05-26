<template lang="pug">
a-drawer(
  v-if="currRow"
  :popup-container="popupContainer"
  :ok-text="$t('common.close')"
  :width="800"
  :visible="props.visible"
  :mask="true"
  :mask-closable="true"
  :esc-to-close="true"
  :hide-cancel="true"
  @ok="handleOk"
  @cancel="handleCancel"
)
  template(#title)
    a-space.log-detail-drawer-title.space-between(fill style="width: 100%")
      a-button-group.log-detail-nav(size="small")
        a-button(:disabled="selectedRowKey === 0" @click="handlePre")
          template(#icon)
            icon-arrow-up
        a-button(:disabled="selectedRowKey === rows.length - 1" @click="handleNext")
          template(#icon)
            icon-arrow-down
      a-radio-group(v-model="viewMode" type="button" size="small")
        a-radio(value="fields") {{ $t('logsQuery.fields') }}
        a-radio(value="json") {{ $t('logsQuery.json') }}
  FormView(v-if="viewMode === 'fields'" :data="viewRow" :columns="columns")
  .gpt-light-editor(v-else)
    JSONView(:jsonStr="JSON.stringify(viewRow, null, 2)")
</template>

<script setup lang="ts" name="LogDetail">
  import type { ColumnType } from '@/types/query'
  import JSONView from './JSONView.vue'
  import FormView from './FormView.vue'

  const props = withDefaults(
    defineProps<{
      visible: boolean
      selectedRowKey: number | null
      currRow: any
      rows: any[]
      columns: ColumnType[]
      popupContainer?: string
    }>(),
    {
      popupContainer: '#log-table-container',
    }
  )
  const emit = defineEmits(['update:visible', 'update:selectedRowKey'])

  const viewMode = ref<'fields' | 'json'>('fields')

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

<style lang="less" scoped>
  .log-detail-drawer-title {
    align-items: center;
  }
</style>

<style lang="less">
  // Global styles for drawer since it's rendered in a portal
  #log-table-container .arco-drawer {
    border: 1px solid var(--color-neutral-3) !important;
  }

  #log-table-container .log-detail-nav.arco-btn-group {
    .arco-btn {
      padding: 0 8px;
    }
  }
</style>
