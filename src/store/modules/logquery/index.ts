import { defineStore } from 'pinia'
import dayjs from 'dayjs'
import { useLocalStorage, useStorage } from '@vueuse/core'
import editorAPI from '@/api/editor'
import { ColumnType, Condition, TSColumn } from '@/views/dashboard/logs/query/types'
import { toObj } from '@/views/dashboard/logs/query/until'
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

const useLogQueryStore = defineStore('logQuery', () => {
  /** sql state */
  // current query result sql
  const sql = ref(``)
  // editing sql
  const editingSql = ref('')
  const inputTableName = ref('') // table after query
  const editingTableName = ref('') // table in editing
  // table schema map
  const tableMap = ref<TableMap>({})
  // computed queried columns schema
  const columns = computed(() => {
    if (!inputTableName.value) {
      return []
    }
    return tableMap.value[inputTableName.value] || []
  })
  const tsColumn = shallowRef<TSColumn>()
  // multiple relative to s, one of 1000 1000 * 1000 1000 * 1000 * 1000
  type Multiple = 1000 | 1000000 | 1000000000
  const multipleRe = /timestamp\((\d)\)/
  const getTsColumn = (tableName: string) => {
    const fields = tableMap.value[tableName] || []
    const tsColumns = fields.filter((column) => column.data_type.toLowerCase().indexOf('timestamp') > -1)
    const tsIndexColumns = tsColumns.filter((column) => column.semantic_type === 'TIMESTAMP')
    const field = tsIndexColumns.length ? tsIndexColumns[0] : tsColumns[0]
    if (!field) {
      return null
    }
    const timescale = multipleRe.exec(field.data_type)
    if (!timescale) return null
    return {
      multiple: (1000 ** (Number(timescale[1]) / 3)) as Multiple,
      ...field,
    }
  }
  // editing ts column
  const editingTsColumn = computed<TSColumn>(() => {
    return getTsColumn(editingTableName.value)
  })

  /** for table */
  // column visible
  const displayedColumns = useStorage<ColumnsMap>('logquery-table-column-visible', {})
  // table rows
  const rows = shallowRef<Array<any>>([])
  // selected row key for detail view
  const selectedRowKey = ref(-1)
  const currRow = computed(() => {
    if (selectedRowKey.value > -1) {
      return rows.value[selectedRowKey.value]
    }
    return null
  })

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
  // query Columns differ from columns, keep orders with query
  const queryColumns = shallowRef<Array<SchemaType>>([])

  const queryLoading = ref(false)
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

  const dataLoadFlag = ref(0)

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
    const fields = tableMap.value[editingTableName.value]
    const index = fields.findIndex((f) => f.name === field)
    if (index === -1) {
      return []
    }
    const type = fields[index].data_type

    const opKey = getColumnOpType(type) as OpKey
    return opMap[opKey] || []
  }
  const limit = ref(1000)

  // query handler
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

  // const getColumn = (name: string) => {
  //   const allColumns = tableMap.value[inputTableName.value]
  //   const index = allColumns.findIndex((column) => column.name === name)
  //   return allColumns[index]
  // }

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
    if (unifiedRange.value.length === 2) {
      if (editingTsColumn.value) {
        const { multiple } = editingTsColumn.value
        const [start, end] = getRelativeRange(multiple)
        let prefix = ' AND'
        if (!where.length) {
          prefix = ''
        }
        where.push(`${prefix} ${editingTsColumn.value.name} >= ${start} AND ${editingTsColumn.value.name} < ${end}`)
      }
    }
    return where
  }

  // construct editing sql
  watch(
    [queryForm, unifiedRange, limit, editingTableName, editingTsColumn],
    () => {
      if (!editingTableName.value) {
        return
      }
      if (editorType.value !== 'builder') {
        return
      }
      let str = `SELECT * FROM "${editingTableName.value}"`
      const where = buildCondition()
      if (where.length) {
        str += ` WHERE ${where.join('')}`
      }
      const tmpTsColumn = editingTsColumn.value
      if (tmpTsColumn) {
        str += ` ORDER BY "${tmpTsColumn.name}" ${queryForm.orderBy}`
      }
      str += ` LIMIT ${limit.value}`
      editingSql.value = str
    },
    {
      immediate: true,
      deep: true,
    }
  )

  // reset displayedColumn when columns change
  watch(columns, () => {
    if (!displayedColumns.value[inputTableName.value]) {
      displayedColumns.value[inputTableName.value] = columns.value.map((c) => c.name)
    }
  })

  function reset() {
    editingTableName.value = ''
    inputTableName.value = ''
    sql.value = ''
    editingSql.value = ''
    queryForm.conditions = []
    rows.value = []
  }

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
    editingTableName,
    tsColumn,
    editingTsColumn,
    time,
    unifiedRange,
    queryNum,
    getSchemas,
    tableMap,
    getRelativeRange,
    editorType,
    queryForm,
    buildCondition,
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
    getOpByField,
    reset,
  }
})

export default useLogQueryStore
