<template lang="pug">
.drilldown-top-bar
  .drilldown-top-bar__main
    DrilldownFilterBar
    a-tooltip(mini :content="t('common.refresh')")
      a-button.gpt-btn-outline-control(
        type="outline"
        size="medium"
        :aria-label="t('common.refresh')"
        @click="handleRefresh"
      )
        template(#icon)
          icon-refresh
  .drilldown-top-bar__actions
    TimeRangeSelect(
      v-model:time-length="time"
      v-model:time-range="rangeTime"
      button-type="outline"
      button-size="medium"
      :show-any-time="false"
    )
</template>

<script setup lang="ts">
  import { useI18n } from 'vue-i18n'
  import TimeRangeSelect from '@/components/time-range-select/index.vue'
  import { useDrilldownContext } from '@/observability/context'
  import DrilldownFilterBar from './filter-bar.vue'

  const { t } = useI18n()
  const { time, rangeTime, triggerRefresh } = useDrilldownContext()

  const handleRefresh = () => {
    triggerRefresh()
  }
</script>

<style scoped lang="less">
  .drilldown-top-bar {
    display: flex;
    align-items: center;
    gap: var(--gpt-gap-md);
    box-sizing: border-box;
    width: 100%;
    min-width: 0;
    min-height: var(--gpt-size-region-bar);
    padding: var(--gpt-toolbar-padding);
  }

  .drilldown-top-bar__main {
    display: flex;
    flex: 0 1 auto;
    align-items: center;
    gap: var(--gpt-gap-md);
    min-width: 0;
    max-width: 100%;
  }

  .drilldown-top-bar__actions {
    display: flex;
    flex-shrink: 0;
    align-items: center;
    gap: var(--gpt-gap-md);
    margin-left: auto;
  }
</style>
