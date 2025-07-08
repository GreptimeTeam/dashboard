import { defineStore } from 'pinia'
import dayjs from 'dayjs'
import { useLocalStorage, useStorage } from '@vueuse/core'
import editorAPI from '@/api/editor'
import { ColumnType, Condition, TSColumn } from '@/views/dashboard/logs/query/types'
import { SchemaType } from '../code-run/types'

type TableMap = { [key: string]: Array<ColumnType> }

const numberTypeRe = /(int|float|decimal|double)/i
const timeTypeRe = /(timestamp|date)/i
type ColumnsMap = {
  [key: string]: Array<string>
}

function getColumnOpType(dataType) {
  let opType = ''
  if (dataType === 'string') {
    opType = 'String'
  } else if (dataType === 'boolean') {
    opType = 'Boolean'
  } else if (numberTypeRe.test(dataType)) {
    opType = 'Number'
  } else if (timeTypeRe.test(dataType)) {
    opType = 'Time'
  }
  return opType
}

const useLogsQueryStore = defineStore('logsQuery', () => {
  /** sql state */
  // current query result sql
  const sql = ref(``)
  // editing sql
  const editingSql = ref('')
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

  // for make all query
  const queryNum = ref(0)
  // for table query
  const tableIndex = ref(0)
  // editor type
  const editorType = ref('builder')

  const refresh = ref(false)
  // always return two element array, because time select component use two variable to implement relative time and range time
  const unifiedRange = computed(() => {
    if (time.value && time.value > 0) {
      return [dayjs().subtract(time.value, 'minute').unix(), dayjs().unix()]
    }
    return rangeTime.value.map((v) => Number(v))
  })

  // convert to time unit by query table, ts column may have different timestamp accuracy
  const getRelativeRange = (multiple: number) => {
    if (time.value && time.value > 0) {
      return [`now() - Interval '${time.value}m'`, 'now()']
    }
    return rangeTime.value.map((v) => Number(v) * multiple)
  }

  /** for sql builder */
  const queryForm = reactive({
    conditions: [] as Array<Condition>,
    orderBy: 'DESC',
  })
  const opMap = {
    String: ['=', 'contains', 'not contains', '!=', 'like'],
    Number: ['=', '!=', '>', '>=', '<', '<='],
    Time: ['>', '>=', '<', '<='],
    Boolean: ['=', '!='],
  }
  type OpKey = keyof typeof opMap

  // get Operator List by field
  function getOpByField(field: string): string[] {
    // This function is no longer needed since we don't maintain tableMap
    // Keeping it for backward compatibility but returning empty array
    return []
  }
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
  function escapeSqlString(value: string) {
    if (typeof value !== 'string') {
      return value // Only escape if it's a string
    }

    // Replace common SQL special characters with their escaped versions
    return value
      .replace(/\\/g, '\\\\') // Escape backslashes
      .replace(/'/g, "''") // Escape single quotes by doubling
      .replace(/\n/g, '\\n') // Escape newline
      .replace(/\r/g, '\\r') // Escape carriage return
  }

  function singleCondition(condition: Condition) {
    const column = condition.field
    const columnType = getColumnOpType(column.data_type)
    const conditionVal = escapeSqlString(condition.value)
    let columnName = condition.field.name
    columnName = `"${columnName}"`

    if (columnType === 'Number' || columnType === 'Time') {
      return `${columnName} ${condition.op} ${condition.value}`
    }
    if (condition.op === 'like') {
      // return `MATCHES(${columnName},'"${escapeSqlString(condition.value)}"')`
      return `${columnName} like '%${conditionVal}%'`
    }
    if (['contains', 'not contains', 'match sequence'].indexOf(condition.op) > -1) {
      let val = escapeSqlString(condition.value)
      if (condition.op === 'not contains') {
        val = `-"${val}"`
      } else if (condition.op === 'contains') {
        val = `"${val}"`
      }
      return `MATCHES(${columnName},'${val}')`
    }
    return `${columnName} ${condition.op} '${escapeSqlString(condition.value)}'`
  }

  function buildCondition() {
    const where = []
    const conditions = queryForm.conditions.filter((v) => v.field && v.op && v.value)
    for (let i = 0; i < conditions.length; i += 1) {
      const condition = conditions[i]
      if (i === 0) {
        where.push(singleCondition(condition))
        continue
      }
      if (condition.rel === 'and') {
        where.push(` AND ${singleCondition(condition)}`)
      } else {
        where.push(` OR ${singleCondition(condition)}`)
      }
    }
    // Time range conditions are now handled in the component
    // since tsColumn is computed there
    return where
  }

  // Note: SQL building is now handled by the general SQLBuilder component

  function reset() {
    currentTableName.value = ''
    sql.value = ''
    editingSql.value = ''
    queryForm.conditions = []
  }

  return {
    sql,
    currentTableName,
    rangeTime,
    time,
    unifiedRange,
    queryNum,
    getSchemas,
    getRelativeRange,
    editorType,
    queryForm,
    buildCondition,
    editingSql,
    displayedColumns,
    limit,
    refresh,
    tableIndex,
    mergeColumn,
    showKeys,
    getOpByField,
    reset,
  }
})

export default useLogsQueryStore
