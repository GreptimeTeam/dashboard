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
    div(style="display: flex; align-items: center; gap: 4px")
      div(v-if="isRelative") {{ relativeTimeMap[timeLength] || props.emptyStr }}

      div(v-else)
        | {{ absoluteTimeLabel }}
      .timezone {{ timezoneLabel }}
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
  import { useDashboardTimezone } from '@/hooks'
  // Timezone label formatter: 'UTC' stays 'UTC', '+08:00' -> 'UTC+8', '-05:00' -> 'UTC-5'

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
  })
  const emit = defineEmits(['update:timeLength', 'update:timeRange', 'change', 'updateTourStep'])

  const rangePickerVisible = ref(false)
  const visible = ref(false)

  const { browserOffset, offsetDiff, timezoneLabel, toBrowserTimezoneTimestamp } = useDashboardTimezone()

  const toTimezoneTime = (value: string | number) => {
    const base = dayjs.unix(Number(value))
    return offsetDiff.value === 0 ? base : base.add(offsetDiff.value, 'minute')
  }

  const isRelative = computed(() => props.timeLength !== 0 || props.timeRange.length === 0)

  const rangePickerModelValue = computed(() => {
    // Case 1: absolute range provided → convert unix seconds to dashboard-timezone Date
    if (props.timeRange.length === 2) {
      const [startDayjs, endDayjs] = props.timeRange.map(toTimezoneTime)
      return [startDayjs.toDate(), endDayjs.toDate()]
    }

    // Case 2: no absolute range → derive from relative timeLength (minutes)
    if (props.timeLength > 0) {
      const nowUnix = Math.floor(Date.now() / 1000)
      const startUnix = nowUnix - props.timeLength * 60
      const [startDayjs, endDayjs] = [startUnix, nowUnix].map(toTimezoneTime)
      return [startDayjs.toDate(), endDayjs.toDate()]
    }

    // Any-time / no time specified
    return undefined
  })

  const absoluteTimeLabel = computed(() => {
    if (props.timeRange.length !== 2) return props.emptyStr
    const [startDayjs, endDayjs] = props.timeRange.map(toTimezoneTime)
    const formattedStart = startDayjs.format('YYYY-MM-DD HH:mm:ss')
    const formattedEnd = endDayjs.format('YYYY-MM-DD HH:mm:ss')

    return `${formattedStart} - ${formattedEnd}`
  })

  const selectTimeRange = ([startDate, endDate]: [Date, Date]) => {
    const start = toBrowserTimezoneTimestamp(startDate)
    const end = toBrowserTimezoneTimestamp(endDate)
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

  .timezone {
    color: var(--brand-color);
    font-size: 12px;
    font-weight: 600;
    line-height: 2;
  }
</style>
