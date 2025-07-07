<template lang="pug">
TimeSelect(
  v-model:time-length="timeLength"
  v-model:time-range="timeRange"
  :button-type="buttonType"
  :button-class="buttonClass"
  :flex-direction="flexDirection"
  :empty-str="emptyStr"
  :button-size="buttonSize"
  :relative-time-map="relativeTimeMapWithAny"
  :relative-time-options="relativeTimeOptionsWithAny"
)
</template>

<script setup lang="ts">
  import { computed, watch, defineModel } from 'vue'
  import { relativeTimeMap, relativeTimeOptions } from '@/views/dashboard/config'
  import TimeSelect from '@/components/time-select/index.vue'

  // Props - same as TimeSelect but with defaults for "Any time"
  const props = withDefaults(
    defineProps<{
      buttonType?: string
      buttonClass?: string
      flexDirection?: string
      emptyStr?: string
      buttonSize?: string
    }>(),
    {
      emptyStr: 'Any time',
      buttonSize: 'small',
    }
  )

  // Emits - unified time range values (v-model emissions handled by defineModel)
  const emit = defineEmits<{
    'update:timeRangeValues': [value: string[]] // New: unified time range values
  }>()

  // Dual model state using defineModel - these are the actual models that users interact with
  const timeLength = defineModel<number>('timeLength', { default: 0 }) // 0 means "Any time" by default
  const timeRange = defineModel<string[]>('timeRange', { default: () => [] })

  // Add "Any time" option to relative time options
  const relativeTimeMapWithAny = computed(() => ({
    0: 'Any time',
    ...relativeTimeMap,
  }))

  const relativeTimeOptionsWithAny = computed(() => [{ value: 0, label: 'Any time' }, ...relativeTimeOptions])

  // Read-only computed property: timeRangeValues - unified format
  const timeRangeValues = computed(() => {
    if (timeRange.value.length === 2) {
      // Absolute time range - convert timestamps to ISO strings
      const start = new Date(Number(timeRange.value[0]) * 1000).toISOString()
      const end = new Date(Number(timeRange.value[1]) * 1000).toISOString()
      return [`'${start}'`, `'${end}'`]
    }
    if (timeLength.value > 0) {
      // Relative time range - use SQL interval (no quotes around SQL functions)
      const start = `now() - Interval '${timeLength.value}m'`
      const end = `now()`
      return [start, end]
    }
    return [] // Any time / no time limit
  })

  // Emit timeRangeValues changes (timeLength and timeRange are handled by defineModel)
  watch(
    timeRangeValues,
    (newValue) => {
      emit('update:timeRangeValues', newValue)
    },
    { immediate: true }
  )

  // Computed helpers
  const hasTimeLimit = computed(() => timeRangeValues.value.length > 0)
  const isRelativeTime = computed(() => timeLength.value > 0)
  const isAbsoluteTime = computed(() => timeRange.value.length === 2)

  // Expose everything for external access
  defineExpose({
    // Models (read-write)
    timeLength,
    timeRange,
    // Unified values (read-only)
    timeRangeValues,
    // Helpers (read-only)
    hasTimeLimit,
    isRelativeTime,
    isAbsoluteTime,
  })
</script>
