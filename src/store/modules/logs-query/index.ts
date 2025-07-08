import { defineStore } from 'pinia'
import { ref, reactive, computed } from 'vue'
import dayjs from 'dayjs'
import { useLocalStorage, useStorage } from '@vueuse/core'
import editorAPI from '@/api/editor'
import { ColumnType, Condition, TSColumn } from '@/views/dashboard/logs/query/types'
import { SchemaType } from '../code-run/types'
import useAppStore from '../app'

type TableMap = { [key: string]: Array<ColumnType> }
type ColumnsMap = {
  [key: string]: Array<string>
}

const useLogsQueryStore = defineStore('logsQuery', () => {
  /** sql state */
  // current query result sql
  const sql = ref(``)
  // editor sql with placeholders
  const editorSql = ref('')
  const currentTableName = ref('') // current table name

  // tsColumn is now computed in the component from query results

  /** for table */
  // column visible
  const displayedColumns = useStorage<ColumnsMap>('logquery-table-column-visible', {})
  // selected row key for detail view - removed currRow as it's not needed in store

  /** toolbar */
  // time select range time
  const rangeTime = ref<Array<string>>([])
  // time select relative time
  const time = ref(10)
  // processed time range values from TimeRangeSelect component
  const timeRangeValues = ref<string[]>([])

  // for make all query
  const queryNum = ref(0)
  // for table query

  // editor type
  const editorType = ref('builder')

  const refresh = ref(false)

  // Unix timestamp range for numeric calculations (intervals, pagination, etc.)
  const unixTimeRange = computed(() => {
    if (time.value && time.value > 0) {
      return [dayjs().subtract(time.value, 'minute').unix(), dayjs().unix()]
    }
    return rangeTime.value.map((v) => Number(v))
  })

  /** for sql builder */
  const queryForm = reactive({
    conditions: [] as Array<Condition>,
    orderBy: 'DESC',
  })

  const limit = ref(1000)

  const mergeColumn = useLocalStorage('logquery-merge-column', true)
  const showKeys = useLocalStorage('logquery-show-keys', true)
  const appStore = useAppStore()
  function getSchemas() {
    const db = appStore.database
    const tableCatalog = db?.split('-').slice(0, -1).join('-')
    const tableSchema = db?.split('-').slice(-1).join('-')

    const conditions = []
    if (tableCatalog) {
      conditions.push(`table_catalog='${tableCatalog}'`)
    }
    if (tableSchema) {
      conditions.push(`table_schema='${tableSchema}'`)
    }
    let where = ''
    if (conditions.length) {
      where = `WHERE ${conditions.join(' and ')}`
    }

    return editorAPI
      .runSQL(
        `SELECT 
          table_name,
          table_schema,
          column_name,
          data_type,
          semantic_type
        FROM 
          information_schema.columns
        ${where}
        ORDER BY 
          table_name
        `
      )
      .then((result) => {
        const { rows: schemaRows } = result.output[0].records
        const tmp: TableMap = {}
        for (let i = 0; i < schemaRows.length; i += 1) {
          const row = schemaRows[i] as string[]
          const tableName = row[0]
          if (!tmp[tableName]) {
            tmp[tableName] = []
          }
          tmp[tableName].push({
            name: row[2],
            data_type: row[3],
            label: row[2],
            semantic_type: row[4],
          })
        }
        // tableMap is no longer used, this function is kept for backward compatibility
      })
  }

  // Note: SQL building is now handled by the general SQLBuilder component

  function reset() {
    currentTableName.value = ''
    sql.value = ''
    editorSql.value = ''
    queryForm.conditions = []
  }

  return {
    sql,
    currentTableName,
    rangeTime,
    time,
    timeRangeValues,
    queryNum,
    getSchemas,
    editorType,
    queryForm,
    editorSql,
    displayedColumns,
    limit,
    refresh,
    mergeColumn,
    showKeys,
    reset,
    unixTimeRange,
  }
})

export default useLogsQueryStore
