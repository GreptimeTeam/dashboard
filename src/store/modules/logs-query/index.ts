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
