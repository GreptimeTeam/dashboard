<template lang="pug">
a-trigger#time-select(
  v-model:popup-visible="visible"
  trigger="click"
  :position="flexDirection === 'row' ? 'br' : 'bl'"
  :update-at-scroll="true"
  :popup-offset="4"
  :click-outside-to-close="guideStep === 'stopTour' || guideStep === ''"
)
  a-button(:type="buttonType" :class="buttonClass" :size="buttonSize")
    template(#icon)
      svg.icon-16
        use(href="#time")
    div(v-if="isRelative") {{ relativeTimeMap[timeLength] || props.emptyStr }}
    div(v-else) {{ absoluteTimeLabel }}
  template(#content)
    a-space.hide
    a-space(
      fill
      align="start"
      :size="0"
      :class="flexDirection"
    )
      template(#split)
        div(style="width: 4px")
      a-range-picker.box-shadow(
        v-show="rangePickerVisible"
        hide-trigger
        format="YYYY-MM-DD HH:mm:ss"
        position="bl"
        :model-value="rangePickerModelValue"
        :show-time="true"
        :trigger-props="{ 'update-at-scroll': true }"
        :placeholder="[$t('dashboard.startTime'), $t('dashboard.endTime')]"
        @ok="selectTimeRange($event)"
      )
      a-space.trigger.relative-time-dropdown(fill direction="vertical" :size="2")
        a-doption(
          v-for="time of relativeTimeOptions"
          :value="time.value"
          :class="isSingleTimeSelected(time.value) ? 'selected' : ''"
          @click="selectTimeLength(time.value)"
        ) {{ time.label }}
        a-doption(:class="!isRelative ? 'selected' : ''" @click="rangePickerVisible = !rangePickerVisible") {{ t('time-select.custom') }}
</template>

<script lang="ts" setup name="TimeSelect">
  import type { OptionsType } from '@/types/global'
  import type { PropType } from 'vue'
  import dayjs from 'dayjs'
  import utc from 'dayjs/plugin/utc'
  import timezone from 'dayjs/plugin/timezone'
  import { useI18n } from 'vue-i18n'
  import { useAppStore } from '@/store'

  dayjs.extend(utc)
  dayjs.extend(timezone)

  const { t } = useI18n()

  const props = defineProps({
    timeLength: {
      type: Number,
      default: 10,
    },
    timeRange: {
      type: Array as PropType<[string, string]>,
      default: () => ['', ''],
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
  })
  const emit = defineEmits(['update:timeLength', 'update:timeRange', 'change', 'updateTourStep'])

  const rangePickerVisible = ref(false)
  const visible = ref(false)

  const { userTimezone } = storeToRefs(useAppStore())

  // ±[h]h:mm
  const offsetRegex = /^([+-])(\d|0\d|1[0-4]):(00|15|30|45)$/

  const dashboardTimezone = computed(() => userTimezone.value?.trim() || dayjs.tz.guess())

  const offsetMinutes = computed(() => {
    const match = offsetRegex.exec(dashboardTimezone.value)
    if (!match) {
      return null
    }
    const [, sign, hoursStr, minutesStr] = match
    const hours = Number(hoursStr)
    const minutes = Number(minutesStr)
    const total = hours * 60 + minutes
    return sign === '-' ? -total : total
  })

  const toUnixInDashboardTz = (value: Date) => {
    if (offsetMinutes.value !== null) {
      return dayjs(value).utcOffset(offsetMinutes.value, true).unix()
    }
    return dayjs(value).tz(dashboardTimezone.value, true).unix()
  }

  const formatUnixInDashboardTz = (unixValue: string | number) => {
    const unixNumber = Number(unixValue)
    if (!Number.isFinite(unixNumber)) return ''
    const base = dayjs.unix(unixNumber)
    return offsetMinutes.value !== null
      ? base.utcOffset(offsetMinutes.value).format('YYYY-MM-DD HH:mm:ss')
      : base.tz(dashboardTimezone.value).format('YYYY-MM-DD HH:mm:ss')
  }

  const unixToDateInDashboardTz = (unixValue: string | number) => {
    const unixNumber = Number(unixValue)
    if (!Number.isFinite(unixNumber)) return null
    const base = dayjs.unix(unixNumber)
    return offsetMinutes.value !== null
      ? base.utcOffset(offsetMinutes.value).toDate()
      : base.tz(dashboardTimezone.value).toDate()
  }

  const isRelative = computed(() => props.timeLength !== 0 || props.timeRange.length === 0)

  const sameTimezone = computed(() => {
    const tzA = dashboardTimezone.value
    const tzB = dayjs.tz.guess()
    const offsetA = dayjs.tz(dayjs(), tzA).utcOffset()
    const offsetB = dayjs.tz(dayjs(), tzB).utcOffset()
    return offsetA === offsetB
  })

  const rangePickerModelValue = computed(() => {
    if (!props.timeRange || props.timeRange.length !== 2) {
      return undefined
    }
    const [start, end] = props.timeRange
    const startDate = unixToDateInDashboardTz(start)
    const endDate = unixToDateInDashboardTz(end)
    if (!startDate || !endDate) {
      return undefined
    }
    return [startDate, endDate]
  })

  const absoluteTimeLabel = computed(() => {
    if (!props.timeRange || props.timeRange.length !== 2) return props.emptyStr
    const [start, end] = props.timeRange
    const formattedStart = formatUnixInDashboardTz(start)
    const formattedEnd = formatUnixInDashboardTz(end)
    if (!formattedStart || !formattedEnd) return props.emptyStr

    return sameTimezone.value
      ? `${formattedStart} - ${formattedEnd}`
      : `${formattedStart} - ${formattedEnd} (${dashboardTimezone.value})`
  })

  const selectTimeRange = (range: [Date, Date]) => {
    const [startDate, endDate] = range
    const start = toUnixInDashboardTz(startDate)
    const end = toUnixInDashboardTz(endDate)
    emit('update:timeRange', [start.toString(), end.toString()])
    emit('update:timeLength', 0)
    emit('change')
    visible.value = false
  }

  const selectTimeLength = (value: any) => {
    emit('update:timeLength', value)
    if (props.timeRange.length > 0) {
      emit('update:timeRange', [])
    }

    visible.value = false
    rangePickerVisible.value = false
  }

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
</style>
