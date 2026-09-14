<template lang="pug">
a-drawer(
  v-if="variant === 'drawer'"
  placement="right"
  width="100%"
  :popup-container="popupContainer"
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
  .span-attributes-content
    .span-header.gpt-muted-bar
      .span-name {{ span?.span_name }}
      a-typography-text.trace-id-value(copyable :copy-text="span?.span_id") {{ span?.span_id }}
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
        span.summary-value {{ formatStartTime(span?.timestamp) }}
    a-tabs(v-model:active-key="viewMode")
      a-tab-pane(key="table" title="Table View")
        a-descriptions(layout="vertical" bordered :column="2")
          a-descriptions-item(v-for="item of spanInfoData" :key="item.label")
            template(#label)
              a-typography-text(copyable :copy-text="String(item.value)") {{ item.label }}
            | {{ item.value }}
      a-tab-pane(key="json" title="JSON View")
        .gpt-light-editor.span-json-editor
          CodeMirror(
            :model-value="jsonView"
            :extensions="extensions"
            :style="codeMirrorStyle"
            :spellcheck="true"
            :autofocus="false"
            :indent-with-tab="true"
            :tab-size="2"
            :disabled="true"
          )

.span-attributes-panel(v-else-if="modelValue && span")
  .panel-header
    span.panel-title Span Attributes
    a-button(type="text" size="mini" @click="updateVisible(false)")
      template(#icon)
        icon-close
  .span-attributes-content.panel-body
    .span-header.gpt-muted-bar
      .span-name {{ span?.span_name }}
      a-typography-text.trace-id-value(copyable :copy-text="span?.span_id") {{ span?.span_id }}
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
        span.summary-value {{ formatStartTime(span?.timestamp) }}
    a-tabs(v-model:active-key="viewMode")
      a-tab-pane(key="table" title="Table View")
        a-descriptions(layout="vertical" bordered :column="1")
          a-descriptions-item(v-for="item of spanInfoData" :key="item.label")
            template(#label)
              a-typography-text(copyable :copy-text="String(item.value)") {{ item.label }}
            | {{ item.value }}
      a-tab-pane(key="json" title="JSON View")
        .gpt-light-editor.span-json-editor
          CodeMirror(
            :model-value="jsonView"
            :extensions="extensions"
            :style="panelCodeMirrorStyle"
            :spellcheck="true"
            :autofocus="false"
            :indent-with-tab="true"
            :tab-size="2"
            :disabled="true"
          )
</template>

<script setup lang="ts">
  import { computed, ref } from 'vue'
  import dayjs from 'dayjs'
  import { json } from '@codemirror/lang-json'
  import { EditorView } from '@codemirror/view'
  import { Codemirror as CodeMirror } from 'vue-codemirror'
  import { IconClose } from '@arco-design/web-vue/es/icon'
  import { formatDuration } from '../utils'
  import type { Span } from '../utils'

  const props = withDefaults(
    defineProps<{
      modelValue: boolean
      span: Span | null
      /** Host for the attributes side drawer (standalone trace page). */
      popupContainer?: string
      /** `drawer` = absolute drawer into host; `panel` = inline side pane (drilldown). */
      variant?: 'drawer' | 'panel'
    }>(),
    {
      popupContainer: '#trace-attributes',
      variant: 'drawer',
    }
  )

  const emit = defineEmits<{
    'update:modelValue': [value: boolean]
  }>()

  function updateVisible(value: boolean) {
    emit('update:modelValue', value)
  }

  function formatStartTime(timestamp: number | undefined) {
    if (timestamp == null) {
      return ''
    }
    return dayjs(timestamp / 1000000).format('YYYY-MM-DD HH:mm:ss.SSS')
  }

  const viewMode = ref('table')
  const extensions = [json(), EditorView.theme({})]
  const codeMirrorStyle = {
    height: 'calc(100vh - 300px)',
    fontSize: '14px',
  }
  const panelCodeMirrorStyle = {
    height: '100%',
    minHeight: '240px',
    fontSize: '13px',
  }

  const spanInfoData = computed(() => {
    if (!props.span) return []

    const { span } = props
    const result: Array<{ label: string; value: string }> = []

    Object.entries(span).forEach(([key, value]) => {
      if (
        key !== '_level' &&
        key !== 'children' &&
        key !== 'key' &&
        key !== 'title' &&
        !key.startsWith('span_attributes.') &&
        !key.startsWith('resource_attributes.')
      ) {
        let formattedValue: string
        if (key === 'timestamp' || key === 'timestamp_end') {
          formattedValue = dayjs(Number(value) / 1000000).format('YYYY-MM-DD HH:mm:ss.SSS')
        } else if (typeof value === 'object') {
          formattedValue = JSON.stringify(value, null, 2)
        } else {
          formattedValue = String(value)
        }

        result.push({
          label: key.replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase()),
          value: formattedValue,
        })
      }
    })
    ;['span_attributes.', 'resource_attributes.'].forEach((prefix) => {
      const obj = Object.entries(span)
        .filter(([key]) => key.startsWith(prefix))
        .reduce((acc, [key, value]) => {
          const cleanKey = key.replace(prefix, '')
          if (value !== null && value !== undefined) {
            acc[cleanKey] = value
          }
          return acc
        }, {} as Record<string, unknown>)

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
    const { key, title, _level, children, ...rest } = props.span
    return JSON.stringify(rest, null, 2)
  })
</script>

<style lang="less" scoped>
  .span-attributes-panel {
    display: flex;
    flex: 1 1 0%;
    flex-direction: column;
    height: 100%;
    min-width: 0;
    min-height: 0;
    overflow: hidden;
    background: var(--gpt-bg-panel);
  }

  .panel-header {
    display: flex;
    flex-shrink: 0;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    height: 48px;
    padding: 0 12px 0 16px;
    border-bottom: 1px solid var(--gpt-border-default);
  }

  .panel-title {
    font-size: 14px;
    font-weight: 700;
    color: var(--gpt-text-primary);
  }

  .panel-body {
    flex: 1 1 0%;
    min-height: 0;
    padding: 12px 16px 16px;
    overflow: auto;
  }

  .span-header.gpt-muted-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;

    .span-name {
      flex-shrink: 0;
      padding: var(--gpt-gap-xs);
      font-size: var(--gpt-font-lg);
    }
  }

  .summary-container {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    margin: var(--gpt-gap-xl) 0;

    .summary-item {
      display: flex;
      align-items: center;
      gap: var(--gpt-gap-md);
      padding: 0 var(--gpt-page-padding-x);

      .summary-label,
      .summary-value {
        font-size: var(--gpt-font-base);
        color: var(--gpt-text-primary);
      }
    }

    .divider {
      width: 1px;
      height: 16px;
      background-color: var(--gpt-border-default);
    }
  }

  .drawer-title {
    display: flex;
    align-items: center;
    justify-content: space-between;
    width: 100%;
    height: 58px;
    font-weight: 700;
    font-size: var(--gpt-font-xl);
    line-height: 20px;
    color: var(--gpt-text-primary);
  }

  :deep(.arco-drawer) {
    position: absolute;
    top: 0;
    right: 0;
    bottom: 0;
    background-color: var(--gpt-bg-panel);
    border-left: 1px solid var(--gpt-border-default);
    box-shadow: -2px 0 8px rgba(0, 0, 0, 0.15);
  }

  :deep(.arco-drawer-header) {
    height: 58px;
    padding: var(--gpt-page-padding-x);
    border-bottom: 1px solid var(--gpt-border-default);
  }

  :deep(.arco-drawer-body) {
    padding: var(--gpt-gap-lg);
  }

  :deep(.cm-editor) {
    height: 100%;
    border: 1px solid var(--gpt-editor-border);
    border-radius: var(--gpt-radius-sm);
    overflow: hidden;
  }

  .span-json-editor :deep(.cm-gutters) {
    border-top-left-radius: var(--gpt-radius-sm);
    border-bottom-left-radius: var(--gpt-radius-sm);
  }

  :deep(.arco-tabs) {
    .arco-tabs-nav {
      margin-bottom: var(--gpt-gap-xl);
    }

    .arco-tabs-content {
      padding: 0;
    }
  }

  :deep(.arco-descriptions-item-value) {
    vertical-align: top;
  }

  :deep(.arco-descriptions-size-medium .arco-descriptions-item-label-block) {
    font-size: var(--gpt-font-md);
  }
</style>
