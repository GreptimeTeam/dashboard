<template lang="pug">
.toolbar.drilldown-top-bar
  .page-identity
    .title-row
      span.page-title {{ t('drilldown.pageTitle') }}
      SignalTabNav(
        mode="navigation"
        aria-label="Signal Explorer"
        :items="signalItems"
        :model-value="signal"
        @update:model-value="onSignalSelect"
      )
  .shared-context
    .drilldown-filter-bar
      span.drilldown-field-label {{ t('drilldown.filters.title') }}
      DrilldownFilterCombobox
    a-button.logs-query-trigger(
      v-if="showLogsQuery"
      type="primary"
      size="medium"
      @click="() => openLogsDetail()"
    ) {{ t('drilldown.logs.showLogs') }}
    a-space
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
  import { computed } from 'vue'
  import { useI18n } from 'vue-i18n'
  import TimeRangeSelect from '@/components/time-range-select/index.vue'
  import { useDrilldownContext } from '@/observability/context'
  import type { DrilldownSignal } from '@/observability/types'
  import DrilldownFilterCombobox from './drilldown-filter-combobox.vue'
  import SignalTabNav from './signal-tab-nav.vue'

  const { t } = useI18n()
  const { signal, time, rangeTime, triggerRefresh, setSignal, logsView, logsTable, openLogsDetail } =
    useDrilldownContext()

  const signalItems = computed(() => [
    { value: 'metrics' as DrilldownSignal, label: t('drilldown.signals.metrics') },
    { value: 'logs' as DrilldownSignal, label: t('drilldown.signals.logs') },
    { value: 'traces' as DrilldownSignal, label: t('drilldown.signals.traces') },
  ])

  /**
   * Manual query trigger for the logs overview only: the top bar shows it next to the
   * Filter, and the detail view queries automatically (refreshKey / time / filters).
   */
  const showLogsQuery = computed(
    () => signal.value === 'logs' && logsView.value === 'overview' && Boolean(logsTable.value)
  )

  const handleRefresh = () => {
    triggerRefresh()
  }

  const onSignalSelect = (value: string) => {
    if (signalItems.value.some((item) => item.value === value)) {
      setSignal(value as DrilldownSignal)
    }
  }
</script>

<style scoped lang="less">
  // Beat `.query-layout.query-layout--stack .toolbar { align-items: center }`
  // so links stretch and the ink can be anchored to the toolbar border.
  .toolbar.drilldown-top-bar {
    align-items: stretch;
    flex-wrap: wrap;
    height: auto;
    min-height: var(--gpt-size-region-bar);
    row-gap: var(--gpt-gap-sm);
  }

  .page-identity {
    display: flex;
    flex-shrink: 0;
    align-self: stretch;
    align-items: stretch;
    min-width: 0;
  }

  .title-row {
    display: flex;
    align-items: stretch;
    gap: var(--gpt-gap-2xl);
    min-width: 0;
  }

  .page-title {
    display: inline-flex;
    flex-shrink: 0;
    align-items: center;
    font-family: var(--font-family-base);
    font-size: var(--gpt-font-xl);
    font-weight: var(--gpt-font-weight-bold);
    line-height: 1.2;
    color: var(--gpt-text-primary);
    white-space: nowrap;
  }

  .shared-context {
    display: flex;
    flex: 1 1 auto;
    align-items: center;
    justify-content: flex-end;
    gap: var(--gpt-gap-md);
    min-width: 0;
    margin-left: auto;

    > .arco-space {
      flex-shrink: 0;
    }
  }

  .drilldown-filter-bar {
    display: inline-flex;
    flex: 1 1 auto;
    flex-wrap: wrap;
    align-items: center;
    justify-content: flex-end;
    gap: var(--gpt-gap-md) var(--gpt-gap-lg);
    min-width: 0;
    max-width: 100%;
  }
</style>
