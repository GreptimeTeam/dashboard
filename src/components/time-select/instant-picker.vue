<template lang="pug">
a-date-picker(
  v-bind="pickerAttrs"
  show-time
  format="YYYY-MM-DD HH:mm:ss"
  :model-value="pickerModelValue"
  :show-now-btn="false"
  :time-picker-props="timePickerProps"
  @change="onChange"
)
  template(#cell="{ date }")
    .arco-picker-date
      .arco-picker-date-value {{ formatCellDate(date) }}
  template(#suffix-icon)
    span.timezone-label {{ timezoneLabel }}
</template>

<script lang="ts" setup name="TimezoneInstantPicker">
  import { computed, useAttrs } from 'vue'
  import { useDashboardTimezone } from '@/hooks'

  const props = withDefaults(
    defineProps<{
      modelValue?: Date | string | number | null
    }>(),
    {
      modelValue: null,
    }
  )

  const emit = defineEmits<{
    (e: 'update:modelValue', value: Date | null): void
    (e: 'change'): void
  }>()

  const attrs = useAttrs()

  // Filter out value-format to ensure onChange always returns Date, not string
  const pickerAttrs = computed(() => {
    const { valueFormat, ...rest } = attrs
    return rest
  })

  const { toBrowserTimezoneTimestamp, toDashboardDate, timezoneLabel } = useDashboardTimezone()

  const pickerModelValue = computed<Date | undefined>(() => {
    if (props.modelValue === null || props.modelValue === undefined || props.modelValue === '') return undefined

    // If modelValue is already a Date, convert it to timezone-adjusted Date for display
    if (props.modelValue instanceof Date) {
      // Convert Date to Unix timestamp, then apply timezone conversion
      const unix = Math.floor(props.modelValue.getTime() / 1000)
      return toDashboardDate(unix)
    }

    // If modelValue is Unix timestamp (string or number), convert it
    return toDashboardDate(props.modelValue)
  })

  // Default time value in dashboard timezone for time picker
  // This sets the default time when user clicks a date (only date, not time)
  const defaultTimezoneTime = computed(() => {
    const nowUnix = Math.floor(Date.now() / 1000)
    return toDashboardDate(nowUnix)
  })

  // Time picker props: set default value to current time in dashboard timezone
  const timePickerProps = computed(() => ({
    defaultValue: defaultTimezoneTime.value,
  }))

  // Format date cell display - just show the day number for calendar grid
  const formatCellDate = (date: Date): string => {
    return String(date.getDate())
  }

  const onChange = (val: Date | null, date) => {
    if (!val) {
      emit('update:modelValue', null)
      emit('change')
      return
    }
    const unix = toBrowserTimezoneTimestamp(date)
    const utcDate = new Date(unix * 1000)
    emit('update:modelValue', utcDate)
    emit('change')
  }
</script>

<style scoped lang="less">
  .timezone-label {
    color: var(--brand-color);
    font-size: 12px;
    font-weight: 600;
    margin-left: 4px;
  }
</style>
