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
    div(v-else) {{ `${dayjs.unix(timeRange[0]).format('YYYY-MM-DD HH:mm:ss')} - ${dayjs.unix(timeRange[1]).format('YYYY-MM-DD HH:mm:ss')} ` }}
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
        value-format="X"
        position="bl"
        :model-value="props.timeRange"
        :show-time="true"
        :disabledDate="(current) => dayjs(current).isAfter(dayjs())"
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
        a-doption(:class="!isRelative ? 'selected' : ''" @click="rangePickerVisible = !rangePickerVisible") Custom
</template>

<script lang="ts" setup name="TimeSelect">
  import type { OptionsType } from '@/types/global'
  import dayjs from 'dayjs'

  const props = defineProps({
    timeLength: {
      type: Number,
      default: 10,
    },
    timeRange: {
      type: Array<string>,
      default: [],
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
      type: String,
      default: 'text',
    },
    buttonSize: {
      type: String,
      default: 'medium',
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

  const isRelative = computed(() => props.timeLength !== 0 || props.timeRange.length === 0)
  const selectTimeRange = (range: any) => {
    emit('update:timeRange', range)
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
