<template lang="pug">
.toolbar.drilldown-top-bar
  .page-identity
    .title-row
      span.page-title {{ t('drilldown.pageTitle') }}
      SignalTabNav(
        mode="navigation"
        :aria-label="t('drilldown.nav.signals')"
        :items="signalItems"
        :model-value="activeSignal"
        @update:model-value="onSignalSelect"
      )
      .explore-nav-divider(aria-hidden="true")
      SignalTabNav(
        mode="navigation"
        :aria-label="t('drilldown.serviceMap.title')"
        :items="viewItems"
        :model-value="activeView"
        @update:model-value="onViewSelect"
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
  // Service Map is an Explore view, not a signal — keep signal nav clear while the map is open.
  const activeSignal = computed(() => (serviceMapActive.value ? '' : signal.value))
  const activeView = computed(() => (serviceMapActive.value ? 'service-map' : ''))
  const signalItems = computed(() => [
    { value: 'metrics', label: 'Metrics' },
    { value: 'logs', label: 'Logs' },
    { value: 'traces', label: 'Traces' },
  ])
  const viewItems = computed(() => [{ value: 'service-map', label: t('drilldown.serviceMap.title') }])

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
    if (!['metrics', 'logs', 'traces'].includes(value)) return
    // Set the selected signal before route hydration, so the service-map view never
    // needs to impersonate a signal just to participate in Explore navigation.
    setSignal(value as DrilldownSignal)
    await router.push({
      query: {
        ...route.query,
        view: undefined,
        signal: value,
        serviceMapSearch: undefined,
        serviceMapScope: undefined,
        serviceMapFilters: undefined,
      },
    })
  }

  const onViewSelect = async (value: string) => {
    if (value !== 'service-map') return
    await router.push({ query: { ...route.query, view: 'service-map' } })
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

  .explore-nav-divider {
    flex-shrink: 0;
    align-self: center;
    width: 1px;
    height: var(--gpt-font-xl);
    background: var(--gpt-border-default);
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
