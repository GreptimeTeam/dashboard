import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import dayjs from 'dayjs'

const useLogsQueryStore = defineStore('logsQuery', () => {
  /** Core SQL state - shared across components */
  const sql = ref(``)

  /** Time selection state - shared across components */
  const rangeTime = ref<Array<string>>([])
  const time = ref(10)
  const timeRangeValues = ref<string[]>([])

  /** Editor configuration - shared */
  const editorType = ref('builder')

  /** Builder form state - shared */
  const builderFormState = ref(null)

  /** Query configuration - shared */
  const limit = ref(1000)

  /** Query execution state - shared */
  const refresh = ref(false)

  /** Computed table name - derived from builder form state or SQL parsing */
  const currentTableName = computed(() => {
    let tableName = ''
    if (editorType.value === 'builder' && builderFormState.value?.table) {
      tableName = builderFormState.value.table
    } else {
      const fromMatch = sql.value.trim().match(/FROM\s+([`"']?)(\w+)\1/i)
      if (fromMatch) {
        tableName = fromMatch[2]
      }
    }
    return tableName
  })

  /** Computed values used by multiple components */
  const unixTimeRange = computed(() => {
    if (time.value && time.value > 0) {
      return [dayjs().subtract(time.value, 'minute').unix(), dayjs().unix()]
    }
    return rangeTime.value.map((v) => Number(v))
  })

  function reset() {
    builderFormState.value = null
    sql.value = ''
  }

  return {
    sql,
    currentTableName,
    rangeTime,
    time,
    timeRangeValues,
    editorType,
    builderFormState,
    limit,
    refresh,
    reset,
    unixTimeRange,
  }
})

export default useLogsQueryStore
