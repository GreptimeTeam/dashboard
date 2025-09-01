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
      showAnyTime?: boolean // New prop to control "Any time" option
    }>(),
    {
      emptyStr: 'Any time',
      buttonSize: 'small',
      showAnyTime: true, // Default to showing "Any time" option
    }
  )

  // Dual model state using defineModel - these are the actual models that users interact with
  const timeLength = defineModel<number>('timeLength', { default: 0 }) // 0 means "Any time" by default
  const timeRange = defineModel<string[]>('timeRange', { default: () => [] })

  // Add "Any time" option to relative time options
  const relativeTimeMapWithAny = computed(() => {
    if (!props.showAnyTime) return relativeTimeMap
    return {
      '-1': 'Any time',
      ...relativeTimeMap,
    }
  })

  const relativeTimeOptionsWithAny = computed(() => {
    if (!props.showAnyTime) return relativeTimeOptions
    return [{ value: -1, label: 'Any time' }, ...relativeTimeOptions]
  })

  // Read-only computed property: timeRangeValues - unified format

  const isRelativeTime = computed(() => timeLength.value > 0)
  const isAbsoluteTime = computed(() => timeRange.value.length === 2)

  // Expose everything for external access
  defineExpose({
    // Models (read-write)
    timeLength,
    timeRange,
    // Unified values (read-only)
    isRelativeTime,
    isAbsoluteTime,
  })
</script>
