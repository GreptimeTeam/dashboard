<template lang="pug">
a-drawer(
  popup-container="#trace-attributes"
  placement="right"
  width="100%"
  :visible="modelValue"
  :footer="false"
  :mask="false"
  :unmount-on-close="true"
  :modal="false"
  @update:visible="updateVisible"
)
  template(#title)
    .drawer-title
      span Span Attributes

  .span-header
    .span-name
      | {{ span?.span_name }}
    a-typography-text.trace-id-value(copyable :copy-text="span?.span_id")
      | {{ span?.span_id }}
  .summary-container
    .summary-item
      span.summary-label Service
      span.summary-value {{ span?.service_name }}
    .divider
    .summary-item
      span.summary-label Duration
      span.summary-value {{ formatDuration(span?.duration_nano) }}
    .divider
    .summary-item
      span.summary-label StartTime
      span.summary-value {{ dayjs(span?.timestamp / 1000000).format('YYYY-MM-DD HH:mm:ss.SSS') }}

  a-tabs(v-model:active-key="viewMode")
    a-tab-pane(key="table" title="Table View")
      a-descriptions(layout="vertical" bordered :column="2")
        a-descriptions-item(v-for="item of spanInfoData")
          template(#label)
            a-typography-text(copyable type="secondary" :copy-text="String(item.value)")
              | {{ item.label }}
          | {{ item.value }}
    a-tab-pane(key="json" title="JSON View")
      CodeMirror(
        :modelValue="jsonView"
        :extensions="extensions"
        :style="codeMirrorStyle"
        :spellcheck="true"
        :autofocus="true"
        :indent-with-tab="true"
        :tabSize="2"
        :disabled="true"
      )
</template>

<script setup lang="ts">
  import { ref, computed } from 'vue'
  import dayjs from 'dayjs'
  import { json } from '@codemirror/lang-json'
  import { EditorView } from '@codemirror/view'
  import { Codemirror as CodeMirror } from 'vue-codemirror'
  import { formatDuration } from '../utils'
  import type { Span } from '../utils'

  const props = defineProps<{
    modelValue: boolean
    span: Span | null
  }>()

  const emit = defineEmits(['update:modelValue'])

  function updateVisible(value: boolean) {
    emit('update:modelValue', value)
  }

  const viewMode = ref('table')
  const extensions = [json(), EditorView.theme({})]
  const codeMirrorStyle = {
    height: 'calc(100vh - 300px)',
    fontSize: '14px',
  }

  const spanInfoData = computed(() => {
    if (!props.span) return []

    const { span } = props
    const result = []

    // Add all span properties except _level and attributes
    Object.entries(span).forEach(([key, value]) => {
      if (
        key !== '_level' &&
        key !== 'children' &&
        key !== 'key' &&
        key !== 'title' &&
        !key.startsWith('span_attributes.') &&
        !key.startsWith('resource_attributes.')
      ) {
        let formattedValue = value
        if (key === 'timestamp' || key === 'timestamp_end') {
          formattedValue = dayjs(value / 1000000).format('YYYY-MM-DD HH:mm:ss.SSS')
        } else if (typeof value === 'object') {
          formattedValue = JSON.stringify(value, null, 2)
        } else {
          formattedValue = String(value)
        }

        result.push({
          label: key.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase()),
          value: formattedValue,
        })
      }
    })

    const mergedAttributes = ['span_attributes.', 'resource_attributes.']

    mergedAttributes.forEach((prefix) => {
      const obj = Object.entries(span)
        .filter(([key]) => key.startsWith(prefix))
        .reduce((acc, [key, value]) => {
          const cleanKey = key.replace(prefix, '')
          if (value !== null && value !== undefined) {
            acc[cleanKey] = value
          }
          return acc
        }, {} as Record<string, any>)

      if (Object.keys(obj).length > 0) {
        result.push({
          label: prefix,
          value: JSON.stringify(obj, null, 2),
        })
      }
    })

    return result
  })

  const jsonView = computed(() => {
    if (!props.span) return ''
    const { span } = props
    const { key, title, _level, children, ...rest } = span
    return JSON.stringify(rest, null, 2)
  })
</script>

<style lang="less" scoped>
  .span-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0;
    border: 1px solid var(--color-border);
    margin-bottom: 8px;
    font-weight: 500;
    color: var(--color-text-2);
    background-color: var(--color-fill-2);

    .span-name {
      display: flex;
      align-items: center;
      gap: 8px;
      flex-shrink: 0;
      padding: 4px;

      .span-name {
        font-size: 14px;
      }
    }
  }

  .summary-container {
    display: flex;
    align-items: left;
    border-top: none;
    margin: 16px 0;

    .summary-item {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 0 16px;

      .summary-label {
        font-size: 12px;
        color: var(--color-text-3);
      }

      .summary-value {
        font-size: 12px;
        color: var(--color-text-1);
      }
    }

    .divider {
      width: 1px;
      height: 16px;
      background-color: var(--color-border);
    }
  }

  .drawer-title {
    display: flex;
    align-items: center;
    justify-content: space-between;
    width: 100%;
    font-weight: 800;
    font-size: 15px;
    line-height: 20px;
    height: 58px;
  }

  :deep(.arco-drawer) {
    position: absolute;
    top: 0;
    right: 0;
    bottom: 0;
    background-color: var(--color-bg-2);
    border-left: 1px solid var(--color-border);
    box-shadow: -2px 0 8px rgba(0, 0, 0, 0.15);
  }

  :deep(.arco-drawer-header) {
    border-bottom: 1px solid var(--color-border);
    padding: 16px;
    height: 58px;
  }

  :deep(.arco-drawer-body) {
    padding: 10px;
  }

  :deep(.cm-editor) {
    height: 100%;
    border: 1px solid var(--color-border);
    border-radius: 4px;
  }

  :deep(.arco-tabs) {
    .arco-tabs-nav {
      margin-bottom: 16px;
    }

    .arco-tabs-content {
      padding: 0;
    }
  }
  :deep(.arco-descriptions-item-value) {
    vertical-align: top;
  }
  :deep(.arco-descriptions-size-medium .arco-descriptions-item-label-block) {
    font-size: 13px;
  }
</style>
