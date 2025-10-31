<template lang="pug">
a-trigger#time-select(
  v-model:popup-visible="visible"
  trigger="click"
  :position="flexDirection === 'row' ? 'bl' : 'br'"
  :update-at-scroll="true"
  :popup-offset="4"
  :click-outside-to-close="guideStep === 'stopTour' || guideStep === ''"
)
  a-button(:type="buttonType" :class="buttonClass" :size="buttonSize")
    template(#icon)
      svg.icon-16
        use(href="#time")
    div(v-if="isRelative") {{ relativeTimeMap[timeLength] || props.emptyStr }}
    div(v-else)
      a-space
        | {{ absoluteTimeLabel }}
        .timezone {{ timezoneLabel }}
  template(#content)
    a-space(
      fill
      align="start"
      :size="0"
      :class="flexDirection"
    )
      template(#split)
        div(style="width: 2px")
      a-space.trigger.relative-time-dropdown(fill direction="vertical" :size="2")
        a-doption(
          v-for="time of relativeTimeOptions"
          :value="time.value"
          :class="isSingleTimeSelected(time.value) ? 'selected' : ''"
          @click="selectTimeLength(time.value)"
        ) {{ time.label }}
        a-doption(:class="!isRelative ? 'selected' : ''" @click="handleCustomClick") {{ t('time-select.custom') }}
      .absolute-range-panel
        .panel-title {{ t('time-select.absoluteRange') }}
        .range-row
          label {{ t('time-select.from') }}
          a-input(
            v-model="startInput"
            placeholder="YYYY-MM-DD HH:mm:ss"
            @focus="isEditingStart = true"
            @blur="handleStartBlur"
            @press-enter="handleStartBlur"
          )
            template(#suffix)
              span.calendar-icon(@click.stop="toggleRangePicker")
                IconCalendar
        .range-row
          label {{ t('time-select.to') }}
          a-input(
            v-model="endInput"
            placeholder="YYYY-MM-DD HH:mm:ss"
            @focus="isEditingEnd = true"
            @blur="handleEndBlur"
            @press-enter="handleEndBlur"
          )
            template(#suffix)
              span.calendar-icon(@click.stop="toggleRangePicker")
                IconCalendar
        .actions
          a-button.apply-btn(
            type="primary"
            size="small"
            long
            @click="applyCustomRange"
          ) {{ t('time-select.applyTimeRange') }}
        .recent-ranges(v-if="recentRangeDisplay.length > 0")
          .title {{ t('time-select.recentAbsoluteRange') }}
          ul
            li(
              v-for="(item, index) in recentRangeDisplay"
              :key="`${item.key}-${index}`"
              @click="applyFromHistory(item.range)"
            ) {{ item.label }}
        .extra
          span {{ t('time-select.timezone') }}
          .timezone {{ userTimezone }}

      .range-picker-popup(v-if="showRangePicker")
        a-range-picker.range-picker(
          hide-trigger
          format="YYYY-MM-DD"
          :popup-visible="true"
          :model-value="rangePickerValue"
          :show-time="false"
          @change="handleRangeChange"
          @ok="handleRangeOk"
          @cancel="closeRangePicker"
          @popup-visible-change="onRangePopupVisibleChange"
        )
</template>

<script lang="ts" setup name="TimeSelect">
  import type { OptionsType } from '@/types/global'
  import type { PropType } from 'vue'
  import dayjs from 'dayjs'
  import utc from 'dayjs/plugin/utc'
  import timezone from 'dayjs/plugin/timezone'
  import { useI18n } from 'vue-i18n'
  import { useAppStore } from '@/store'
  import { formatTimezoneLabel, normalizeTimezone } from '@/utils/timezone'
  import { IconCalendar } from '@arco-design/web-vue/es/icon'

  dayjs.extend(utc)
  dayjs.extend(timezone)

  const { t } = useI18n()

  const props = defineProps({
    timeLength: {
      type: Number,
      default: 10,
    },
    timeRange: {
      type: Array as PropType<string[]>,
      default: () => [],
    },
    flexDirection: {
      type: String,
      default: 'row',
    },
    buttonClass: {
      type: String,
      default: '',
    },
    buttonType: {
      type: String as PropType<'text' | 'dashed' | 'outline' | 'primary' | 'secondary'>,
      default: 'text' as const,
    },
    buttonSize: {
      type: String as PropType<'medium' | 'small' | 'mini' | 'large'>,
      default: 'medium' as const,
    },
    relativeTimeOptions: {
      type: Array<OptionsType>,
      default: [],
    },
    relativeTimeMap: {
      type: Object as PropType<{ [key: number]: string }>,
      default: () => ({}),
    },
    guideStep: {
      type: String,
      default: '',
    },
    emptyStr: {
      type: String,
      default: '',
    },
    context: {
      type: String,
      default: 'dashboard',
    },
  })
  const emit = defineEmits(['update:timeLength', 'update:timeRange', 'change', 'updateTourStep'])

  const MAX_HISTORY = 5

  type RecentRange = {
    from: number
    to: number
  }

  const contextKey = computed(() => (props.context?.trim() ? props.context.trim() : 'dashboard'))
  const storageKey = computed(() => `greptime:${contextKey.value}:range-history`)
  const recentRanges = ref<RecentRange[]>([])

  const { userTimezone } = storeToRefs(useAppStore())

  const visible = ref(false)
  const startValue = ref<Date | null>(null)
  const endValue = ref<Date | null>(null)
  const startInput = ref('')
  const endInput = ref('')
  const isEditingStart = ref(false)
  const isEditingEnd = ref(false)
  const showRangePicker = ref(false)

  const OFFSET_REGEX = /^[+-]\d{2}:\d{2}$/
  const browserOffset = dayjs().utcOffset()

  const parseOffsetMinutes = (offset: string) => {
    const sign = offset.startsWith('-') ? -1 : 1
    const [hours, minutes] = offset
      .slice(1)
      .split(':')
      .map((item) => Number(item))
    return sign * (hours * 60 + minutes)
  }

  const dashboardOffset = computed(() => {
    const tz = userTimezone.value?.trim()
    if (!tz) {
      return browserOffset
    }
    if (tz === 'UTC') {
      return 0
    }
    if (OFFSET_REGEX.test(tz)) {
      return parseOffsetMinutes(tz)
    }
    return dayjs().tz(normalizeTimezone(tz)).utcOffset()
  })

  const offsetDiff = computed(() => dashboardOffset.value - browserOffset)
  const timezoneLabel = computed(() => formatTimezoneLabel(userTimezone.value))

  const toUtcTime = (value: Date) => dayjs(value).subtract(offsetDiff.value, 'minute').unix()

  const toTimezoneTime = (value: string | number) => {
    const base = dayjs.unix(Number(value))
    return offsetDiff.value === 0 ? base : base.add(offsetDiff.value, 'minute')
  }

  const isRelative = computed(() => props.timeLength !== 0)

  const absoluteTimeLabel = computed(() => {
    if (props.timeRange.length !== 2) return props.emptyStr
    const [startDayjs, endDayjs] = props.timeRange.map(toTimezoneTime)
    return `${startDayjs.format('YYYY-MM-DD HH:mm:ss')} - ${endDayjs.format('YYYY-MM-DD HH:mm:ss')}`
  })

  const loadRecentRanges = () => {
    try {
      const data = localStorage.getItem(storageKey.value)
      if (!data) {
        recentRanges.value = []
        return
      }
      const parsed = JSON.parse(data)
      if (!Array.isArray(parsed)) {
        recentRanges.value = []
        return
      }
      recentRanges.value = parsed
        .filter((item) => item && typeof item.from === 'number' && typeof item.to === 'number')
        .slice(0, MAX_HISTORY)
    } catch {
      recentRanges.value = []
    }
  }

  const saveRecentRange = (range: RecentRange) => {
    recentRanges.value = [range, ...recentRanges.value].slice(0, MAX_HISTORY)
    localStorage.setItem(storageKey.value, JSON.stringify(recentRanges.value))
  }

  const ensureRangeOrder = () => {
    if (!startValue.value || !endValue.value) return
    if (dayjs(startValue.value).isAfter(dayjs(endValue.value))) {
      endValue.value = dayjs(startValue.value).add(1, 'minute').toDate()
    }
  }

  const updateInputsFromValues = () => {
    if (startValue.value && !isEditingStart.value) {
      startInput.value = dayjs(startValue.value).format('YYYY-MM-DD HH:mm:ss')
    }
    if (endValue.value && !isEditingEnd.value) {
      endInput.value = dayjs(endValue.value).format('YYYY-MM-DD HH:mm:ss')
    }
  }

  const getDefaultRange = () => {
    const end = dayjs().add(offsetDiff.value, 'minute')
    const start = end.subtract(1, 'hour')
    return { start: start.toDate(), end: end.toDate() }
  }

  const syncFromProps = () => {
    if (props.timeRange.length === 2) {
      const [startDayjs, endDayjs] = props.timeRange.map(toTimezoneTime)
      startValue.value = startDayjs.toDate()
      endValue.value = endDayjs.toDate()
    } else {
      const { start, end } = getDefaultRange()
      startValue.value = start
      endValue.value = end
    }
    ensureRangeOrder()
    updateInputsFromValues()
  }

  const ensureValues = () => {
    if (!startValue.value || !endValue.value) {
      syncFromProps()
    }
  }

  const openRangePicker = () => {
    ensureValues()
    showRangePicker.value = true
  }

  const closeRangePicker = () => {
    showRangePicker.value = false
  }

  const toggleRangePicker = () => {
    showRangePicker.value = !showRangePicker.value
    if (showRangePicker.value) {
      ensureValues()
    }
  }

  const emitRange = () => {
    if (!startValue.value || !endValue.value) return
    const start = toUtcTime(startValue.value).toString()
    const end = toUtcTime(endValue.value).toString()
    emit('update:timeRange', [start, end])
  }

  const rangePickerValue = computed(() => {
    if (!startValue.value || !endValue.value) {
      return undefined
    }
    return [startValue.value, endValue.value]
  })

  const recentRangeDisplay = computed(() =>
    recentRanges.value.map((range) => {
      const start = toTimezoneTime(range.from)
      const end = toTimezoneTime(range.to)
      return {
        key: `${range.from}-${range.to}`,
        label: `${start.format('YYYY-MM-DD HH:mm:ss')} - ${end.format('YYYY-MM-DD HH:mm:ss')}`,
        range,
      }
    })
  )

  const mergeDateWithTime = (value: Date, current: Date | null, fallback: string) => {
    const dateString = dayjs(value).format('YYYY-MM-DD')
    const timeString = current ? dayjs(current).format('HH:mm:ss') : fallback
    return dayjs(`${dateString} ${timeString}`, 'YYYY-MM-DD HH:mm:ss', true).toDate()
  }

  const handleStartBlur = () => {
    const parsed = dayjs(startInput.value, 'YYYY-MM-DD HH:mm:ss', true)
    if (parsed.isValid()) {
      startValue.value = parsed.toDate()
      ensureRangeOrder()
      updateInputsFromValues()
    } else if (startValue.value) {
      startInput.value = dayjs(startValue.value).format('YYYY-MM-DD HH:mm:ss')
    }
    isEditingStart.value = false
  }

  const handleEndBlur = () => {
    const parsed = dayjs(endInput.value, 'YYYY-MM-DD HH:mm:ss', true)
    if (parsed.isValid()) {
      endValue.value = parsed.toDate()
      ensureRangeOrder()
      updateInputsFromValues()
    } else if (endValue.value) {
      endInput.value = dayjs(endValue.value).format('YYYY-MM-DD HH:mm:ss')
    }
    isEditingEnd.value = false
  }

  const applyCustomRange = () => {
    if (!startValue.value || !endValue.value) return
    ensureRangeOrder()
    const startUtc = toUtcTime(startValue.value)
    const endUtc = toUtcTime(endValue.value)
    saveRecentRange({ from: startUtc, to: endUtc })
    emit('update:timeLength', 0)
    emitRange()
    emit('change')
    visible.value = false
    closeRangePicker()
  }

  const handleCustomClick = () => {
    ensureValues()
    emit('update:timeLength', 0)
    emitRange()
    openRangePicker()
  }

  const handleRangeOk = (value: [Date, Date]) => {
    if (!value || value.length !== 2) {
      closeRangePicker()
      return
    }
    const [start, end] = value
    startValue.value = mergeDateWithTime(start, startValue.value, '00:00:00')
    endValue.value = mergeDateWithTime(end, endValue.value, '23:59:59')
    ensureRangeOrder()
    updateInputsFromValues()
    closeRangePicker()
  }

  const handleRangeChange = (value: [Date, Date] | undefined) => {
    if (!value || value.length !== 2) {
      return
    }
    const [start, end] = value
    startValue.value = mergeDateWithTime(start, startValue.value, '00:00:00')
    endValue.value = mergeDateWithTime(end, endValue.value, '23:59:59')
    ensureRangeOrder()
    updateInputsFromValues()
  }

  const applyFromHistory = (range: RecentRange) => {
    startValue.value = toTimezoneTime(range.from).toDate()
    endValue.value = toTimezoneTime(range.to).toDate()
    applyCustomRange()
  }

  const onRangePopupVisibleChange = (val: boolean) => {
    if (!val) {
      closeRangePicker()
    }
  }

  const selectTimeLength = (value: any) => {
    emit('update:timeLength', value)
    if (props.timeRange.length > 0) {
      emit('update:timeRange', [])
    }
    visible.value = false
    closeRangePicker()
  }

  watch(
    () => [props.timeRange[0], props.timeRange[1], offsetDiff.value],
    () => {
      syncFromProps()
    },
    { immediate: true }
  )

  watch(
    () => [startValue.value, endValue.value],
    () => {
      updateInputsFromValues()
    }
  )

  watch(visible, (val) => {
    if (!val) {
      closeRangePicker()
    }
  })

  watch(storageKey, () => {
    loadRecentRanges()
  })

  onMounted(loadRecentRanges)

  watchEffect(() => {
    if (props.guideStep === 'openTimeSelectStep') {
      visible.value = true
      emit('updateTourStep')
    } else if (props.guideStep === 'stopTour') {
      visible.value = false
      emit('change')
    }
  })

  function isSingleTimeSelected(value: any) {
    if (props.timeRange.length > 0) {
      return false
    }
    return props.timeLength === value
  }
</script>

<style lang="less" scoped>
  .row {
    flex-direction: row;
  }

  .row-reverse {
    flex-direction: row-reverse;
  }

  .no-border {
    border: none;
  }

  .box-shadow {
    box-shadow: 0 1px 10px 0 var(--box-shadow-color);
  }

  .trigger {
    border: 1px solid var(--border-color);
    background-color: var(--card-bg-color);
    box-shadow: 0 1px 10px 0 var(--box-shadow-color);
    padding: 4px 0;
    border-radius: 4px;
    align-items: flex-start;
  }

  .relative-time-dropdown {
    .arco-dropdown-option {
      width: 135px;
      &.selected {
        background-color: var(--list-hover-color);
        font-weight: 600;
      }
    }
    .arco-dropdown-option:not(.arco-dropdown-option-disabled):hover {
      background-color: var(--list-hover-color);
    }
    :deep(.arco-space-item:last-of-type) {
      border-top: 1px solid var(--light-border-color);
      margin-top: 2px;
      padding-top: 4px;
    }
  }

  .absolute-range-panel,
  .range-picker-popup {
    display: flex;
    flex-direction: column;
    gap: 8px;
    min-width: 320px;
    padding: 8px 12px;
    border: 1px solid var(--border-color);
    border-radius: 4px;
    background-color: var(--card-bg-color);
    box-shadow: 0 1px 10px 0 var(--box-shadow-color);
  }

  .range-picker {
    width: 100%;
  }

  .panel-title {
    margin: 0;
    font-size: 12px;
    font-weight: 600;
    color: var(--main-font-color);
  }

  .range-row {
    display: flex;
    align-items: center;
    gap: 8px;

    label {
      min-width: 48px;
      font-size: 12px;
      color: var(--secondary-text-color);
    }
  }

  .actions {
    display: flex;
    margin-top: 8px;
  }

  .apply-btn {
    width: 100%;
    font-weight: 600;
  }

  .recent-ranges {
    margin-top: 10px;
    font-size: 12px;
    color: var(--secondary-text-color);

    .title {
      display: block;
      margin-bottom: 4px;
      font-weight: 600;
      color: var(--main-font-color);
    }

    ul {
      list-style: none;
      padding: 0;
      margin: 0;

      li {
        cursor: pointer;
        padding: 8px 6px;
        border-radius: 4px;

        &:hover {
          background-color: var(--list-hover-color);
          color: var(--main-font-color);
        }
      }
    }
  }

  .extra {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-top: 6px;
    font-size: 12px;
    color: var(--secondary-text-color);

    span {
      font-weight: 600;
      color: var(--main-font-color);
    }
  }

  .calendar-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 20px;
    height: 20px;
    color: var(--secondary-text-color);
    cursor: pointer;

    &:hover {
      color: var(--brand-color);
    }
  }

  .timezone {
    color: var(--brand-color);
    font-size: 12px;
    font-weight: 600;
  }
</style>
