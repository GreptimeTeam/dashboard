<template lang="pug">
.toolbar
  a-radio-group(
    type="button"
    size="medium"
    :model-value="signal"
    @update:modelValue="handleSignalChange"
  )
    a-radio(value="metrics") {{ t('drilldown.signals.metrics') }}
    a-radio(value="logs") {{ t('drilldown.signals.logs') }}
    a-radio(value="traces") {{ t('drilldown.signals.traces') }}
  DrilldownFilterBar
  a-space(style="margin-left: auto")
    TimeRangeSelect(
      v-model:time-length="time"
      v-model:time-range="rangeTime"
      button-type="outline"
      button-size="medium"
      :show-any-time="false"
    )
    a-tooltip(mini :content="t('common.refresh')")
      a-button.gpt-btn-outline-control(
        type="outline"
        size="medium"
        :aria-label="t('common.refresh')"
        @click="handleRefresh"
      )
        template(#icon)
          icon-refresh
</template>

<script setup lang="ts">
  import { useI18n } from 'vue-i18n'
  import TimeRangeSelect from '@/components/time-range-select/index.vue'
  import { useDrilldownContext } from '@/observability/context'
  import type { DrilldownSignal } from '@/observability/types'
  import DrilldownFilterBar from './filter-bar.vue'

  const { t } = useI18n()
  const { signal, time, rangeTime, triggerRefresh, setSignal } = useDrilldownContext()

  const handleSignalChange = (value: string | number | boolean) => {
    setSignal(String(value) as DrilldownSignal)
  }

  const handleRefresh = () => {
    triggerRefresh()
  }
</script>
