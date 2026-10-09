<template lang="pug">
.form-view
  a-descriptions(layout="vertical" bordered :column="1")
    a-descriptions-item(v-for="item of formData" :key="item.title")
      template(#label)
        a-typography-text(copyable type="secondary" :copy-text="item.copyText")
          | {{ item.title }} : {{ item.type }}
      pre.form-view-value(v-if="item.isJson") {{ item.value }}
      template(v-else) {{ item.value }}
</template>

<script setup name="FormView" lang="ts">
  import type { ColumnType } from '@/types/query'
  import { isJsonDataType, stringifyJsonForDisplay } from '@/utils/json-display'

  const props = withDefaults(
    defineProps<{
      data?: Record<string, unknown> | null
      columns?: ColumnType[]
      hideJsonNulls?: boolean
    }>(),
    {
      hideJsonNulls: true,
    }
  )

  function safeText(value: unknown): string {
    if (value === null || value === undefined) return ''
    const valueType = typeof value
    if (valueType === 'string' || valueType === 'number' || valueType === 'boolean' || valueType === 'bigint') {
      return String(value)
    }
    if (valueType === 'object') {
      try {
        return JSON.stringify(value)
      } catch {
        return '[Unsupported Object]'
      }
    }
    return ''
  }

  const formData = computed(() => {
    return Object.keys(props.data || {})
      .filter((v) => v !== 'key' && v !== 'index' && v !== '__rowIndex' && v !== '__globalRowIndex')
      .map((v) => {
        const columnType = props.columns?.find((c) => c.name === v)?.data_type
        const raw = props.data?.[v]
        const isJson = isJsonDataType(columnType)
        const display = isJson
          ? stringifyJsonForDisplay(raw, { hideNulls: props.hideJsonNulls, pretty: true })
          : safeText(raw)
        const copyText = isJson
          ? stringifyJsonForDisplay(raw, { hideNulls: props.hideJsonNulls, pretty: false })
          : safeText(raw)

        return {
          title: v,
          type: columnType,
          value: display,
          copyText,
          isJson,
        }
      })
  })
</script>

<style scoped lang="less">
  .form-view-value {
    margin: 0;
    font-family: var(--font-mono);
    white-space: pre-wrap;
    word-break: break-word;
  }

  :deep(.arco-descriptions-item-value) {
    font-family: var(--font-mono);
  }
</style>
