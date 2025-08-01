<template lang="pug">
.editor
  .main
    Codemirror(
      v-model="localSql"
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

<script lang="ts" setup name="SqlTextEditor">
  import { shallowRef, computed, watch, nextTick } from 'vue'
  import { EditorView } from '@codemirror/view'
  import { Codemirror } from 'vue-codemirror'
  import { sql } from '@codemirror/lang-sql'
  import { useDebounceFn } from '@vueuse/core'
  import editorAPI from '@/api/editor'
  import { parseTable, parseLimit, parseOrderBy } from '@/views/dashboard/logs/query/until'
  import type { TextEditorFormState, TSColumn } from '@/types/query'
  import { TsTypeMapping } from '@/utils/date-time'

  interface Props {
    modelValue: string
    height?: string
    placeholder?: string
    disabled?: boolean
    autofocus?: boolean
  }

  const props = withDefaults(defineProps<Props>(), {
    modelValue: '',
    height: '74px',
    placeholder: 'Please enter the sql.',
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

  // Schema for SQL syntax highlighting
  const schema = ref<Record<string, string[]>>({})

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
        backgroundColor: 'grey',
      },
  })

  const extensions = computed(() => {
    const result = [customSelectionTheme]
    result.push(sql({ schema: schema.value }))
    return result
  })

  const cmView = shallowRef<EditorView>()
  const handleReady = ({ view }: any) => {
    cmView.value = view
  }

  // Function to extract table name from SQL
  function extractTableName(sqlText: string): string {
    return parseTable(sqlText)
  }
  const tableName = ref<string | null>(extractTableName(localSql.value))

  // Function to extract timestamp column from SQL and update schema
  async function extractTsColumn(sqlText: string): Promise<TSColumn | null> {
    if (!sqlText || !tableName.value) return null
    try {
      const columns = await editorAPI.getTableSchema(tableName.value)

      schema.value[tableName.value] = columns
      const tsColumns = columns.filter((col) => col.data_type.toLowerCase().includes('timestamp'))

      // Prefer columns with TIMESTAMP semantic type
      const tsIndexColumns = tsColumns.filter((col) => col.semantic_type === 'TIMESTAMP')
      const selectedColumn = tsIndexColumns.length ? tsIndexColumns[0] : tsColumns[0]
      return {
        ...selectedColumn,
        data_type: TsTypeMapping[selectedColumn.data_type] || selectedColumn.data_type,
      }
    } catch (error) {
      console.warn('Failed to extract timestamp column:', error)
    }

    return null
  }

  // Function to parse SQL and emit table name and ts column
  function parseAndEmitSqlInfo(sqlText: string) {
    if (!sqlText.trim()) return

    // Extract table name
    tableName.value = extractTableName(sqlText)
    const limit = parseLimit(sqlText)
    const orderBy = parseOrderBy(sqlText) as 'DESC' | 'ASC' | null
    emit('update:sqlInfo', {
      table: tableName.value,
      limit,
      orderBy,
      sql: sqlText,
    } as TextEditorFormState)
  }

  // Create debounced version of parseAndEmitSqlInfo
  const debouncedParseAndEmitSqlInfo = useDebounceFn(parseAndEmitSqlInfo, 300)

  watch(
    tableName,
    async (newTableName) => {
      if (newTableName) {
        nextTick(async () => {
          const tsColumn = await extractTsColumn(localSql.value)
          if (tsColumn) {
            const limit = parseLimit(localSql.value)
            const orderBy = parseOrderBy(localSql.value) as 'DESC' | 'ASC' | null
            emit('update:sqlInfo', {
              tsColumn,
              table: tableName.value,
              sql: localSql.value,
              limit,
              orderBy,
            } as TextEditorFormState)
          }
        })
      }
    },
    { immediate: true }
  )

  // Watch for SQL changes and emit table name and ts column with debounce
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
