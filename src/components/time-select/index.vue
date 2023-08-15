<template lang="pug">
a-trigger(
  v-model:popup-visible="visible"
  trigger="click"
  :position="flexDirection === 'row' ? 'br' : 'bl'"
  :update-at-scroll="true"
  @click="emit('openTimeSelect')"
)
  a-button(style="padding-left: 8px" :type="buttonType" :class="buttonClass")
    template(#icon)
      svg.icon-20
        use(href="#calendar")
    div(v-if="isRelative") {{ relativeTimeMap[timeLength] }}
    div(v-else) {{ `${dayjs.unix(timeRange[0]).format('YYYY-MM-DD HH:mm:ss')} - ${dayjs.unix(timeRange[1]).format('YYYY-MM-DD HH:mm:ss')} ` }}
  template(#content)
    a-space(
      fill
      align="start"
      :size="0"
      :class="flexDirection"
    )
      template(#split)
        div(style="width: 4px")
      a-range-picker.no-border.box-shadow(
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
        @ok="emit('selectTimeRange', $event)"
      )
      a-space.trigger.relative-time-dropdown(fill direction="vertical" :size="2")
        a-doption(
          v-for="time of relativeTimeOptions"
          :value="time.value"
          :class="time.value === timeLength ? 'selected' : ''"
          @click="emit('selectTimeLength', time.value)"
        ) {{ time.label }}
        a-doption(:class="!isRelative ? 'selected' : ''" @click="emit('clickCustom')") Custom
</template>

<script lang="ts" setup name="TimeSelect">
  import type { OptionsType } from '@/types/global'
  import dayjs from 'dayjs'

  const props = defineProps({
    triggerVisible: {
      type: Boolean,
      default: false,
    },
    isRelative: {
      type: Boolean,
      default: true,
    },
    rangePickerVisible: {
      type: Boolean,
      default: false,
    },
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
    relativeTimeOptions: {
      type: Array<OptionsType>,
      default: [],
    },
    relativeTimeMap: {
      type: Object as PropType<{ [key: number]: string }>,
      default: () => ({}),
    },
  })

  const emit = defineEmits(['openTimeSelect', 'selectTimeRange', 'selectTimeLength', 'clickCustom'])
  const visible = ref(false)
  const visibleFromProps = toRef(props, 'triggerVisible')

  watch(visibleFromProps, () => {
    visible.value = visibleFromProps.value
  })
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
    box-shadow: 0 2px 10px 0 var(--box-shadow-color);
  }

  .trigger {
    background-color: var(--card-bg-color);
    box-shadow: 0 2px 10px 0 var(--box-shadow-color);
    padding: 6px;
    border-radius: 6px;
    align-items: flex-start;
  }

  .relative-time-dropdown {
    .arco-dropdown-option {
      width: 140px;
      &.selected {
        background-color: var(--light-brand-color);
        font-weight: 600;
      }
      border-radius: 6px;
    }
    .arco-dropdown-option:not(.arco-dropdown-option-disabled):hover {
      background-color: var(--light-brand-color);
    }
    .arco-space-item:last-of-type {
      border-top: 1px solid var(--light-border-color);
      margin-top: 2px;
      padding-top: 4px;
    }
  }
</style>
