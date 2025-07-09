import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import dayjs from 'dayjs'

const useLogsQueryStore = defineStore('logsQuery', () => {
  /** Core SQL state - shared across components */
  const sql = ref(``)
  const currentTableName = ref('')

  /** Time selection state - shared across components */
  const rangeTime = ref<Array<string>>([])
  const time = ref(10)
  const timeRangeValues = ref<string[]>([])

  /** Editor configuration - shared */
  const editorType = ref('builder')

  /** Query configuration - shared */
  const limit = ref(1000)

  /** Query execution state - shared */
  const refresh = ref(false)

  /** Computed values used by multiple components */
  const unixTimeRange = computed(() => {
    if (time.value && time.value > 0) {
      return [dayjs().subtract(time.value, 'minute').unix(), dayjs().unix()]
    }
    return rangeTime.value.map((v) => Number(v))
  })

  function reset() {
    currentTableName.value = ''
    sql.value = ''
  }

  return {
    sql,
    currentTableName,
    rangeTime,
    time,
    timeRangeValues,
    editorType,
    limit,
    refresh,
    reset,
    unixTimeRange,
  }
})

export default useLogsQueryStore
