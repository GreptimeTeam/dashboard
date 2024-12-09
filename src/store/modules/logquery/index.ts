import { defineStore } from 'pinia'
import dayjs from 'dayjs'
import { useLocalStorage, useStorage } from '@vueuse/core'
import editorAPI from '@/api/editor'
import { ColumnType, Condition, TSColumn } from '@/views/dashboard/logs/query/types'
import { toObj } from '@/views/dashboard/logs/query/until'
import { SchemaType } from '../code-run/types'

type TableMap = { [key: string]: Array<ColumnType> }

export const typeMap = {
  'string': 'String',
  'int unsigned': 'Number',
  'bigint': 'Number',
  'int32': 'Number',
  'int64': 'Number',
  'double': 'Number',
  'float64': 'Number',
  'timestamp': 'Time',
  'timestamp(3)': 'Time',
  'timestamp(6)': 'Time',
  'timestamp(9)': 'Time',
}
type ColumnsMap = {
  [key: string]: Array<string>
}

const useLogQueryStore = defineStore('logQuery', () => {
  const sql = ref(``)
  const editingSql = ref('')
  // const columns = shallowRef<Array<SchemaType>>([])
  const displayedColumns = useStorage<ColumnsMap>('logquery-table-column-visible', {})
  const rows = shallowRef<Array<any>>([])
  const tableMap = ref<TableMap>({})

  const selectedRowKey = ref(-1)
  const currRow = computed(() => {
    if (selectedRowKey.value > -1) {
      return rows.value[selectedRowKey.value]
    }
    return null
  })

  const rangeTime = ref<Array<string>>([])
  const time = ref(10)
  const inputTableName = ref('')

  const columns = computed(() => {
    if (!inputTableName.value) {
      return []
    }
    return tableMap.value[inputTableName.value]
  })
  const queryNum = ref(0)
  const tableIndex = ref(0)
  const editorType = ref('builder')
  const queryColumns = shallowRef<Array<SchemaType>>([])

  const queryForm = reactive({
    conditions: [] as Array<Condition>,
    orderBy: 'DESC',
  })

  const limit = ref(1000)
  const queryLoading = ref(false)
  const refresh = ref(false)
  // unix seconds
  const unifiedRange = computed(() => {
    if (time.value && time.value > 0) {
      return [dayjs().subtract(time.value, 'minute').unix(), dayjs().unix()]
    }
    return rangeTime.value.map((v) => Number(v))
  })

  const getRelativeRange = (multiple: number) => {
    if (time.value && time.value > 0) {
      return [`now() - Interval '${time.value}m'`, 'now()']
    }
    return rangeTime.value.map((v) => Number(v) * multiple)
  }
  // multiple relative to s, one of 1000 1000 * 1000 1000 * 1000 * 1000
  type Multiple = 1000 | 1000000 | 1000000000
  const multipleRe = /timestamp\((\d)\)/
  const dataLoadFlag = ref(0)
  const tsColumn = computed<TSColumn>(() => {
    const fields = tableMap.value[inputTableName.value] || []
    const field = fields.filter((column) => column.data_type.toLowerCase().indexOf('timestamp') > -1)[0]
    if (!field) {
      return null
    }
    const timescale = multipleRe.exec(field.data_type)
    if (!timescale) return null
    return {
      multiple: (1000 ** (Number(timescale[1]) / 3)) as Multiple,
      ...field,
    }
  })

  const query = () => {
    queryLoading.value = true
    return editorAPI
      .runSQL(sql.value)
      .then((result) => {
        // columns.value = result.output[0].records.schema.column_schemas
        queryColumns.value = result.output[0].records.schema.column_schemas
        rows.value = result.output[0].records.rows.map((row, index) => {
          return toObj(row, queryColumns.value, index, tsColumn.value)
        })
      })
      .finally(() => {
        queryLoading.value = false
        dataLoadFlag.value = Math.random()
      })
  }

  const getColumnByName = (name: string) => {
    const index = columns.value.findIndex((column) => column.name === name)
    return columns.value[index]
  }

  const getColumn = (name: string) => {
    const allColumns = tableMap.value[inputTableName.value]
    const index = allColumns.findIndex((column) => column.name === name)
    return allColumns[index]
  }

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
          data_type
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
          })
        }
        tableMap.value = tmp
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
      .replace(/"/g, '\\"') // Escape double quotes (if needed)
      .replace(/\n/g, '\\n') // Escape newline
      .replace(/\r/g, '\\r') // Escape carriage return
  }

  function singleCondition(condition: Condition) {
    const column = condition.field
    const columnType = typeMap[column.data_type as keyof typeof typeMap]
    if (columnType === 'Number' || columnType === 'Time') {
      return `${condition.field.name} ${condition.op} ${condition.value}`
    }
    if (condition.op === 'like') {
      // return `MATCHES(${condition.field.name},'"${escapeSqlString(condition.value)}"')`
      return `${condition.field.name} like '%${condition.value}%'`
    }
    if (['contains', 'not contains', 'match sequence'].indexOf(condition.op) > -1) {
      let val = escapeSqlString(condition.value)
      if (condition.op === 'not contains') {
        val = `-"${val}"`
      } else if (condition.op === 'match sequence') {
        val = `"${val}"`
      }
      return `MATCHES(${condition.field.name},'"${val}"')`
    }
    return `${condition.field.name} ${condition.op} '"${escapeSqlString(condition.value)}"'`
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
    if (unifiedRange.value.length === 2) {
      if (tsColumn.value) {
        const { multiple } = tsColumn.value
        const [start, end] = getRelativeRange(multiple)
        let prefix = ' AND'
        if (!where.length) {
          prefix = ''
        }
        where.push(`${prefix} ${tsColumn.value.name} >= ${start} AND ${tsColumn.value.name} < ${end}`)
      }
    }
    return where
  }

  watch(
    [queryForm, unifiedRange, limit],
    () => {
      if (!inputTableName.value) {
        return
      }
      if (editorType.value !== 'builder') {
        return
      }
      let str = `SELECT * FROM ${inputTableName.value}`
      const where = buildCondition()
      if (where.length) {
        str += ` WHERE ${where.join('')}`
      }
      if (tsColumn.value) {
        str += ` ORDER BY ${tsColumn.value?.name} ${queryForm.orderBy}`
      }
      str += ` LIMIT ${limit.value}`
      editingSql.value = str
    },
    {
      immediate: true,
      deep: true,
    }
  )

  watch(columns, () => {
    if (!displayedColumns.value[inputTableName.value]) {
      displayedColumns.value[inputTableName.value] = columns.value.map((c) => c.name)
    }
  })

  return {
    sql,
    query,
    rows,
    columns,
    getColumnByName,
    currRow,
    selectedRowKey,
    rangeTime,
    inputTableName,
    tsColumn,
    time,
    unifiedRange,
    queryNum,
    getSchemas,
    tableMap,
    getRelativeRange,
    editorType,
    queryForm,
    buildCondition,
    getColumn,
    editingSql,
    displayedColumns,
    limit,
    queryLoading,
    refresh,
    tableIndex,
    mergeColumn,
    dataLoadFlag,
    showKeys,
    queryColumns,
  }
})
export default useLogQueryStore
