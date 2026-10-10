import { ref, computed } from 'vue'

const useTimeRange = (defaults = { time: 10 }) => {
  const rangeTime = ref<string[]>([])
  const time = ref(defaults.time)

  const timeRangeValues = computed(() => {
    if (rangeTime.value.length === 2) {
      // Absolute time range - convert timestamps to ISO strings
      const start = new Date(Number(rangeTime.value[0]) * 1000).toISOString()
      const end = new Date(Number(rangeTime.value[1]) * 1000).toISOString()
      return [`'${start}'`, `'${end}'`]
    }
    if (time.value > 0) {
      // Relative time range - use SQL interval (no quotes around SQL functions)
      const start = `now() - Interval '${time.value}m'`
      const end = `now()`
      return [start, end]
    }
    return [] // Any time / no time limit
  })

  const unixTimeRange = () => {
    // Prefer absolute range when present so chart pan/zoom commits are not
    // ignored if relative `time` was left non-zero by a UI race.
    if (rangeTime.value.length === 2) {
      return [Number(rangeTime.value[0]), Number(rangeTime.value[1])]
    }
    if (time.value > 0) {
      const now = Math.floor(Date.now() / 1000)
      const start = now - time.value * 60
      return [start, now]
    }
    return []
  }

  function reset() {
    rangeTime.value = []
    time.value = defaults.time
  }

  return {
    rangeTime,
    time,
    timeRangeValues,
    unixTimeRange,

    reset,
  }
}

export default useTimeRange
