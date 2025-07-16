<template lang="pug">
.editor
  .main
    Codemirror(
      v-model="editorSql"
      placeholder="Please enter the sql."
      :style="{ width: '100%', height: config.height, fontSize: '14px' }"
      :extensions="extensions"
      :autofocus="config.autofocus"
      :disabled="config.disabled"
      :indent-with-tab="config.indentWithTab"
      :tab-size="config.tabSize"
      @ready="handleReady"
    )
</template>

<script lang="ts" setup name="InputEditor">
  import { defineComponent, reactive, shallowRef, computed, watch, onMounted, nextTick } from 'vue'
  import { EditorView, ViewUpdate } from '@codemirror/view'
  import { Codemirror } from 'vue-codemirror'
  import { sql } from '@codemirror/lang-sql'
  import { oneDark } from '@codemirror/theme-one-dark'
  import { storeToRefs } from 'pinia'
  import useLogsQueryStore from '@/store/modules/logs-query'
  import { addTsCondition, parseTable, parseTimeRange, processSQL, parseLimit } from './until'
  import type { TSColumn } from './types'

  const { editorSql, timeRangeValues } = storeToRefs(useLogsQueryStore())
  const emit = defineEmits(['query'])

  interface Props {
    schema?: Record<string, string[]>
    tsColumn?: TSColumn | null
  }

  const props = withDefaults(defineProps<Props>(), {
    schema: () => ({}),
    tsColumn: null,
  })

  const config = {
    disabled: false,
    indentWithTab: true,
    tabSize: 2,
    autofocus: true,
    height: '134.9px',
    language: 'mysql',
  }

  // Watch timeRangeValues - no need to auto-add conditions since SQL uses placeholders
  // The finalQuery computation in the main component will handle placeholder replacement
  watch(timeRangeValues, () => {
    // timeRangeValues updated - placeholder replacement will be handled by finalQuery
  })

  const customSelectionTheme = EditorView.theme({
    '&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection':
      {
        backgroundColor: 'grey', // Set to any color you prefer, e.g., an orange with 30% opacity
      },
  })

  const extensions = computed(() => {
    const result = [customSelectionTheme]
    result.push(sql({ schema: props.schema }))
    return result
  })

  const cmView = shallowRef<EditorView>()
  const handleReady = ({ view }: any) => {
    cmView.value = view
  }
</script>

<style lang="less" scoped>
  .toolbar {
    padding: 5px 0;
    display: flex;
    justify-content: space-between;
  }
  .pickup-table {
    padding: 10px;
    width: 600px;
    background-color: var(--color-bg-popup);
    border-radius: 4px;
    box-shadow: 0 2px 8px 0 rgba(0, 0, 0, 0.15);
    min-height: 130px;
  }
  .icon,
  :deep(.arco-btn-size-medium.arco-btn-only-icon) {
    width: 16px;
    height: 16px;
  }
  :deep(.arco-radio-group-button) {
    background-color: var(--color-fill-2);
  }
  :deep(.cm-editor) {
    outline: none;
  }
  .editor {
    background-color: var(--color-bg-2);
    border-bottom-left-radius: 2px;
    border-bottom-right-radius: 2px;
    border: 1px solid var(--color-neutral-3);
  }
</style>
