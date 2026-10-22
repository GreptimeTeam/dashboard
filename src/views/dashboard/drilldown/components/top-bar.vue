<template lang="pug">
.toolbar.drilldown-top-bar
  .page-identity
    .title-row
      span.page-title {{ t('drilldown.pageTitle') }}
      SignalTabNav(
        mode="navigation"
        :aria-label="t('drilldown.pageTitle')"
        :items="signalItems"
        :model-value="activeNav"
        @update:model-value="onSignalSelect"
      )
  .shared-context
    .drilldown-filter-bar(v-if="!serviceMapActive")
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
  import { useRoute, useRouter } from 'vue-router'
  import TimeRangeSelect from '@/components/time-range-select/index.vue'
  import { useDrilldownContext } from '@/observability/context'
  import type { DrilldownSignal } from '@/observability/types'
  import DrilldownFilterCombobox from './drilldown-filter-combobox.vue'
  import SignalTabNav from './signal-tab-nav.vue'

  const { t } = useI18n()
  const ctx = useDrilldownContext()
  const route = useRoute()
  const router = useRouter()
  const { signal } = ctx.connection
  const { time, rangeTime } = ctx.query
  const { logsView } = ctx.ui
  const logsTable = ctx.semantics.logs.table
  const { triggerRefresh, setSignal, openLogsDetail } = ctx.actions

  const serviceMapActive = computed(() => route.query.view === 'service-map')
  const activeNav = computed(() => (serviceMapActive.value ? 'service-map' : signal.value))
  const signalItems = computed(() => [
    { value: 'metrics', label: 'Metrics' },
    { value: 'logs', label: 'Logs' },
    { value: 'traces', label: 'Traces' },
    { value: 'service-map', label: t('drilldown.serviceMap.title') },
  ])

  /**
   * Manual query trigger for the logs overview only: the top bar shows it next to the
   * Filter, and the detail view queries automatically (refreshKey / time / filters).
   */
  const showLogsQuery = computed(
    () =>
      !serviceMapActive.value && signal.value === 'logs' && logsView.value === 'overview' && Boolean(logsTable.value)
  )

  const handleRefresh = () => {
    triggerRefresh()
  }

  const onSignalSelect = async (value: string) => {
    if (value === 'service-map') {
      await router.push({ query: { ...route.query, view: 'service-map' } })
      return
    }
    if (['metrics', 'logs', 'traces'].includes(value)) {
      // Set the selected signal before route hydration, so the service-map view never
      // needs to impersonate a signal just to participate in Explore navigation.
      setSignal(value as DrilldownSignal)
      await router.push({
        query: {
          ...route.query,
          view: undefined,
          signal: value,
          serviceMapSearch: undefined,
          serviceMapFilters: undefined,
        },
      })
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
