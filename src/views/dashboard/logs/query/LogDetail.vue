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
      a-space(size="medium")
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
      a-checkbox(v-if="hasJsonColumn" v-model="hideJsonNulls" size="small")
        | {{ $t('dashboard.hideJsonNulls') }}
  FormView(
    v-if="viewMode === 'fields'"
    :data="viewRow"
    :columns="columns"
    :hide-json-nulls="hideJsonNulls"
  )
  .gpt-light-editor(v-else)
    JSONView(:jsonStr="jsonViewStr")
</template>

<script setup lang="ts" name="LogDetail">
  import type { ColumnType } from '@/types/query'
  import { isJsonDataType, stripNullKeys } from '@/utils/json-display'
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
  /** Shared by Fields + JSON modes; match DataTable default. */
  const hideJsonNulls = ref(true)

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

  const hasJsonColumn = computed(() => props.columns.some((column) => isJsonDataType(column.data_type)))

  const jsonViewStr = computed(() => {
    const row = viewRow.value || {}
    if (!hideJsonNulls.value) {
      return JSON.stringify(row, null, 2)
    }

    const next: Record<string, unknown> = {}
    Object.keys(row).forEach((key) => {
      const columnType = props.columns.find((column) => column.name === key)?.data_type
      const value = row[key]
      if (!isJsonDataType(columnType)) {
        next[key] = value
        return
      }
      // Align with FormView: parse JSON text then strip null keys.
      let prepared: unknown = value
      if (typeof value === 'string') {
        const trimmed = value.trim()
        if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
          try {
            prepared = JSON.parse(trimmed)
          } catch {
            prepared = value
          }
        }
      }
      next[key] = stripNullKeys(prepared)
    })
    return JSON.stringify(next, null, 2)
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
