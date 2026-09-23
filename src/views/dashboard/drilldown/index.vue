<template lang="pug">
.query-layout.query-layout--stack.drilldown-page.query-container
  .content-wrapper.query-layout-cards.drilldown-content-wrapper
    a-card.drilldown-top-card(:bordered="false")
      DrilldownTopBar

    .drilldown-body.new-layout.new-layout--workspace(v-if="signal === 'metrics'")
      keep-alive
        MetricsOverview(v-if="!drawerVisible")
      .drilldown-detail-shell(v-if="drawerVisible")
      DrilldownDrawer(
        popup-container=".drilldown-body"
        :visible="drawerVisible"
        :breadcrumbs="metricsCrumbs"
        :subtitle="metricOriginalName || undefined"
        @close="closeDrawer"
      )
        template(#actions)
          MetricDetailActions(v-if="selectedMetric" :metric="selectedMetric")
        MetricDetail(v-if="selectedMetric" :metric="selectedMetric")

    .drilldown-body.new-layout.new-layout--workspace.drilldown-body--logs(v-else-if="signal === 'logs'")
      keep-alive
        LogsOverview(v-if="!logsDrawerVisible")
      .drilldown-detail-shell(v-if="logsDrawerVisible")
      DrilldownDrawer(
        popup-container=".drilldown-body--logs"
        variant="logs"
        :visible="logsDrawerVisible"
        :closable="false"
        :breadcrumbs="logsDetailCrumbs"
        @close="closeLogsDrawer"
      )
        template(#toolbar)
          LogsDetailFilters
        template(#tabs)
          SignalTabNav(
            mode="tabs"
            aria-label="Logs detail"
            :items="logsDetailTabs"
            :model-value="logsTab"
            @update:model-value="onLogsTabSelect"
          )
        LogsDetail(v-if="logsDrawerVisible")

      DrilldownDrawer(
        popup-container=".drilldown-body--logs"
        variant="stacked"
        :visible="tracesGanttVisible"
        :breadcrumbs="logsGanttCrumbs"
        :subtitle="t('drilldown.traces.ganttDrawerTitle')"
        @close="closeTracesGanttDrawer"
      )
        TracesGantt(v-if="tracesGanttVisible")

    .drilldown-body.new-layout.new-layout--workspace.drilldown-body--traces(v-else-if="signal === 'traces'")
      keep-alive
        TracesHome(v-if="!tracesHomeHidden")
      .drilldown-detail-shell(v-if="tracesHomeHidden")
      DrilldownDrawer(
        popup-container=".drilldown-body--traces"
        variant="logs"
        :visible="logsFromTraceVisible"
        :closable="false"
        :title="logsTraceIdLabel"
        @close="closeLogsForTraceDrawer"
      )
        template(#tabs)
          SignalTabNav(
            mode="tabs"
            aria-label="Logs detail"
            :items="logsDetailTabs"
            :model-value="logsTab"
            @update:model-value="onLogsTabSelect"
          )
        LogsDetail(v-if="logsFromTraceVisible")

      DrilldownDrawer(
        popup-container=".drilldown-body--traces"
        variant="stacked"
        :visible="tracesGanttVisible"
        :breadcrumbs="tracesGanttCrumbs"
        :subtitle="t('drilldown.traces.ganttDrawerTitle')"
        @close="closeTracesGanttDrawer"
      )
        TracesGantt(v-if="tracesGanttVisible")
</template>

<script setup lang="ts">
  import { computed, ref, watch } from 'vue'
  import { useI18n } from 'vue-i18n'
  import { useRoute, useRouter } from 'vue-router'
  import { useDrilldownContextProvider } from '@/observability/context'
  import { isLogsDetailTab, LOGS_DETAIL_TABS } from '@/observability/types'
  import { resolveMetricMeta } from '@/observability/semantics'
  import useDrilldownUrlSync from '@/observability/use-drilldown-url-sync'
  import useDrilldownLogsInit from '@/observability/use-drilldown-logs-init'
  import useDrilldownTracesInit from '@/observability/use-drilldown-traces-init'
  import DrilldownDrawer from './components/drilldown-drawer.vue'
  import DrilldownTopBar from './components/top-bar.vue'
  import SignalTabNav from './components/signal-tab-nav.vue'
  import MetricsOverview from './metrics/metrics-overview.vue'
  import MetricDetail from './metrics/metric-detail.vue'
  import MetricDetailActions from './metrics/metric-detail-actions.vue'
  import LogsOverview from './logs/logs-overview.vue'
  import LogsDetail from './logs/logs-detail.vue'
  import LogsDetailFilters from './logs/logs-detail-filters.vue'
  import TracesHome from './traces/traces-home.vue'
  import TracesGantt from './traces/traces-gantt.vue'

  defineOptions({
    name: 'Drilldown',
  })

  const { t } = useI18n()
  const route = useRoute()
  const router = useRouter()
  const ctx = useDrilldownContextProvider()
  const urlSync = useDrilldownUrlSync(ctx, route, router)
  urlSync.initializeFromQuery()
  useDrilldownLogsInit(ctx)
  useDrilldownTracesInit(ctx)

  const { signal, logsTab, setLogsTab } = ctx
  const logsDetailTabLabels = {
    logs: 'drilldown.logs.logsTab',
    labels: 'drilldown.logs.labelsTab',
  } as const
  const logsDetailTabs = computed(() =>
    LOGS_DETAIL_TABS.map((value) => ({
      value,
      label: t(logsDetailTabLabels[value]),
    }))
  )

  const selectedMetric = computed(() => ctx.metric.value)
  const drawerVisible = computed(() => Boolean(selectedMetric.value))
  const logsDrawerVisible = computed(() => ctx.logsView.value === 'detail')
  const logsFromTraceVisible = computed(() => Boolean(ctx.logsTraceId.value))
  const tracesGanttVisible = computed(() => Boolean(ctx.focusTraceId.value))
  const tracesHomeHidden = computed(() => tracesGanttVisible.value || logsFromTraceVisible.value)
  const focusTraceIdLabel = computed(() => ctx.focusTraceId.value || '')
  const logsTraceIdLabel = computed(() => ctx.logsTraceId.value || '')
  const metricOriginalName = ref<string | null>(null)

  watch(
    selectedMetric,
    async (name) => {
      if (!name) {
        metricOriginalName.value = null
        return
      }
      const meta = await resolveMetricMeta(name, ctx.metricsDatabase.value)
      if (ctx.metric.value === name) {
        metricOriginalName.value = meta.originalName
      }
    },
    { immediate: true }
  )

  const closeDrawer = () => {
    ctx.metric.value = undefined
  }

  const closeLogsDrawer = () => {
    ctx.closeLogsDetail()
  }

  const closeLogsForTraceDrawer = () => {
    ctx.closeLogsForTrace()
  }

  const closeTracesGanttDrawer = () => {
    ctx.closeTraceGantt()
  }

  const closeLogsToOverview = () => {
    closeTracesGanttDrawer()
    if (logsDrawerVisible.value) {
      closeLogsDrawer()
    }
  }

  const logsDetailLabel = computed(
    () => ctx.logsSelectedGroup.value || ctx.logsTable.value || t('drilldown.logs.logsSectionTitle')
  )

  const metricsCrumbs = computed(() => [
    { label: t('drilldown.nav.overview'), onSelect: closeDrawer },
    { label: selectedMetric.value || '', mono: true },
  ])

  const logsDetailCrumbs = computed(() => [
    { label: t('drilldown.nav.overview'), onSelect: closeLogsDrawer },
    { label: logsDetailLabel.value },
  ])

  const logsGanttCrumbs = computed(() => {
    const overview = { label: t('drilldown.nav.overview'), onSelect: closeLogsToOverview }
    const current = { label: focusTraceIdLabel.value, mono: true }
    if (!logsDrawerVisible.value) {
      return [overview, current]
    }
    return [overview, { label: logsDetailLabel.value, onSelect: closeTracesGanttDrawer }, current]
  })

  const tracesGanttCrumbs = computed(() => [{ label: focusTraceIdLabel.value, mono: true }])

  const onLogsTabSelect = (value: string) => {
    if (isLogsDetailTab(value)) {
      setLogsTab(value)
    }
  }
</script>

<style scoped lang="less">
  .drilldown-page.query-container {
    display: flex;
    flex-direction: column;
    height: calc(100vh - var(--gpt-gap-3xl));
    max-height: calc(100vh - var(--gpt-gap-3xl));
    overflow: hidden;
  }

  .drilldown-content-wrapper {
    display: flex;
    flex: 1 1 0%;
    flex-direction: column;
    height: 100%;
    min-height: 0;
    overflow: hidden;
  }

  .drilldown-top-card {
    flex: 0 0 auto;
  }

  // Keeps popup-container sized when overview is unmounted for the detail virtual route.
  .drilldown-detail-shell {
    flex: 1 1 0%;
    align-self: stretch;
    min-width: 0;
    min-height: 0;
  }
</style>
