<template lang="pug">
.editor.gpt-light-editor
  .main
    Codemirror(
      v-model="localSql"
      :placeholder="$t('common.enterSql')"
      :style="{ width: '100%', height: config.height, fontSize: '14px' }"
      :extensions="extensions"
      :autofocus="config.autofocus"
      :disabled="config.disabled"
      :indent-with-tab="config.indentWithTab"
      :tab-size="config.tabSize"
      @ready="handleReady"
    )
</template>

<script lang="ts" setup name="SqlTextEditor">
  import { shallowRef, computed, watch, ref } from 'vue'
  import { EditorView } from '@codemirror/view'
  import { Codemirror } from 'vue-codemirror'
  import { sql } from '@codemirror/lang-sql'
  import { useDebounceFn } from '@vueuse/core'
  import useTableSchemaStore, { type TableSchemaColumn } from '@/store/modules/table-schema'
  import { parseTable, parseLimit, parseOrderBy, parseTsColumnFromSql } from '@/views/dashboard/logs/query/until'
  import { bareTableName } from '@/utils/sql'
  import type { TextEditorFormState, TSColumn } from '@/types/query'
  import { TsTypeMapping } from '@/utils/date-time'

  interface Props {
    modelValue: string
    height?: string
    disabled?: boolean
    autofocus?: boolean
  }

  const props = withDefaults(defineProps<Props>(), {
    modelValue: '',
    height: '74px',
    disabled: false,
    autofocus: true,
  })

  const emit = defineEmits<{
    (event: 'update:modelValue', value: string): void
    (event: 'update:sqlInfo', value: TextEditorFormState): void
  }>()

  // Local SQL state
  const localSql = computed({
    get: () => props.modelValue,
    set: (value: string) => emit('update:modelValue', value),
  })

  /** Column names for CodeMirror autocomplete — only updated when the table changes. */
  const autocompleteSchema = shallowRef<Record<string, string[]>>({})
  /** Cached column metadata by bare table name (avoids refetch while typing). */
  const columnsByTable = shallowRef<Record<string, TableSchemaColumn[]>>({})
  const loadingTable = ref<string | null>(null)

  const config = {
    disabled: props.disabled,
    indentWithTab: true,
    tabSize: 2,
    autofocus: props.autofocus,
    height: props.height,
    language: 'mysql',
  }

  const customSelectionTheme = EditorView.theme({
    '&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection':
      {
        backgroundColor: 'var(--gpt-bg-code-selection)',
      },
  })

  const extensions = computed(() => {
    const result = [customSelectionTheme]
    result.push(sql({ schema: autocompleteSchema.value }))
    return result
  })

  const cmView = shallowRef<EditorView>()
  const handleReady = ({ view }: any) => {
    cmView.value = view
  }

  function extractTableName(sqlText: string): string {
    return parseTable(sqlText)
  }

  const tableName = ref<string | null>(extractTableName(localSql.value))

  function toTsColumn(column: { name: string; data_type?: string; semantic_type?: string }): TSColumn {
    return {
      ...column,
      name: column.name,
      data_type: TsTypeMapping[column.data_type || ''] || column.data_type || 'TimestampMillisecond',
    } as TSColumn
  }

  /** Resolve ts column from SQL first; enrich type from cached schema when available. */
  function resolveTsColumn(sqlText: string, columns?: TableSchemaColumn[]): TSColumn | null {
    const fromSql = parseTsColumnFromSql(sqlText)
    if (fromSql) {
      const matched = columns?.find((col) => col.name === fromSql)
      if (matched) return toTsColumn(matched)
      return toTsColumn({ name: fromSql, data_type: 'TimestampMillisecond', semantic_type: 'TIMESTAMP' })
    }
    if (!columns?.length) return null
    const tsColumns = columns.filter((col) => col.data_type.toLowerCase().includes('timestamp'))
    const tsIndexColumns = tsColumns.filter((col) => col.semantic_type === 'TIMESTAMP')
    const selectedColumn = tsIndexColumns.length ? tsIndexColumns[0] : tsColumns[0]
    return selectedColumn ? toTsColumn(selectedColumn) : null
  }

  function emitSqlInfo(sqlText: string, columns?: TableSchemaColumn[]) {
    const table = extractTableName(sqlText)
    tableName.value = table
    const limit = parseLimit(sqlText)
    const orderBy = parseOrderBy(sqlText) as 'DESC' | 'ASC' | null
    const tsColumn = resolveTsColumn(sqlText, columns)
    // Do not echo `sql` back — v-model already owns it; re-assigning can reset the cursor.
    emit('update:sqlInfo', {
      table,
      limit,
      orderBy,
      ...(tsColumn ? { tsColumn } : {}),
    } as TextEditorFormState)
  }

  /** Fetch schema only when the bare table name changes; use session cache. */
  async function ensureSchemaForTable(tableRef: string) {
    const schemaTable = bareTableName(tableRef)
    if (!schemaTable) return undefined
    if (columnsByTable.value[schemaTable]) {
      return columnsByTable.value[schemaTable]
    }
    if (loadingTable.value === schemaTable) {
      return undefined
    }
    loadingTable.value = schemaTable
    try {
      const columns = await useTableSchemaStore().ensureTableSchema(schemaTable)
      columnsByTable.value = { ...columnsByTable.value, [schemaTable]: columns }
      const names = columns.map((col) => col.name)
      const prev = autocompleteSchema.value[schemaTable]
      const same = prev && prev.length === names.length && prev.every((name, index) => name === names[index])
      // Updating autocompleteSchema rebuilds CM extensions — only when names actually change.
      if (!same) {
        autocompleteSchema.value = { ...autocompleteSchema.value, [schemaTable]: names }
      }
      return columns
    } catch (error) {
      console.warn('Failed to load table schema:', error)
      return undefined
    } finally {
      if (loadingTable.value === schemaTable) {
        loadingTable.value = null
      }
    }
  }

  function parseAndEmitSqlInfo(sqlText: string) {
    if (!sqlText.trim()) return

    const table = extractTableName(sqlText)
    const schemaTable = bareTableName(table || '')
    const cached = schemaTable ? columnsByTable.value[schemaTable] : undefined

    // Sync path while typing: no network.
    emitSqlInfo(sqlText, cached)

    // Async path only when this table has not been loaded yet.
    if (schemaTable && !cached) {
      ensureSchemaForTable(table).then((columns) => {
        if (!columns || extractTableName(localSql.value) !== table) return
        emitSqlInfo(localSql.value, columns)
      })
    }
  }

  const debouncedParseAndEmitSqlInfo = useDebounceFn(parseAndEmitSqlInfo, 300)

  watch(
    localSql,
    (newSql) => {
      if (newSql && newSql.trim()) {
        debouncedParseAndEmitSqlInfo(newSql)
      }
    },
    { immediate: true }
  )
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
    border-radius: var(--gpt-radius-sm);
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
  .editor {
    overflow: hidden;
    border-radius: var(--gpt-radius-sm);
  }

  :deep(.cm-editor),
  :deep(.ͼ1.cm-editor) {
    outline: none;
  }
</style>
