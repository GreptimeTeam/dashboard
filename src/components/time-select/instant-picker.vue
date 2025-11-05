<template lang="pug">
a-date-picker(
  v-bind="$attrs"
  show-time
  format="YYYY-MM-DD HH:mm:ss"
  :model-value="pickerModelValue"
  @change="onChange"
)
</template>

<script lang="ts" setup name="TimezoneInstantPicker">
  import { computed } from 'vue'
  import { useDashboardTimezone } from '@/hooks'

  const props = withDefaults(
    defineProps<{
      modelValue?: string | number | null
    }>(),
    {
      modelValue: null,
    }
  )

  const emit = defineEmits<{
    (e: 'update:modelValue', value: string | null): void
    (e: 'change'): void
  }>()

  const { toUtcUnix, toTimezoneDate } = useDashboardTimezone()

  const pickerModelValue = computed<Date | undefined>(() => {
    if (props.modelValue === null || props.modelValue === undefined || props.modelValue === '') return undefined
    return toTimezoneDate(props.modelValue)
  })

  const onChange = (val: Date | null) => {
    if (!val) {
      emit('update:modelValue', null)
      emit('change')
      return
    }
    const unix = toUtcUnix(val)
    emit('update:modelValue', String(unix))
    emit('change')
  }
</script>

<style scoped lang="less"></style>
