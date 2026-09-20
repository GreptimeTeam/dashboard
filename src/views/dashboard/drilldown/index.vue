<template lang="pug">
.query-layout.query-layout--stack.drilldown-page.query-container
  .content-wrapper.query-layout-cards.drilldown-content-wrapper
    a-card.drilldown-top-card(:bordered="false")
      DrilldownTopBar

    .drilldown-body.new-layout.new-layout--workspace(v-if="signal === 'metrics'")
      keep-alive
        MetricsOverview(v-if="!drawerVisible")
      .drilldown-detail-shell(v-if="drawerVisible")

      a-drawer.metric-detail-drawer(
        popup-container=".drilldown-body"
        placement="right"
        width="100%"
        :visible="drawerVisible"
        :footer="false"
        :mask="false"
        :esc-to-close="true"
        :unmount-on-close="true"
        @cancel="closeDrawer"
        @update:visible="onDrawerVisible"
      )
        template(#title)
          .drawer-title
            .drawer-title-text
              DrawerBreadcrumb(:items="metricsCrumbs")
              span.drawer-metric-original(v-if="metricOriginalName" :title="metricOriginalName") {{ metricOriginalName }}
            MetricDetailActions(v-if="selectedMetric" :metric="selectedMetric")
        MetricDetail(v-if="selectedMetric" :metric="selectedMetric")

    .drilldown-body.new-layout.new-layout--workspace.drilldown-body--logs(v-else-if="signal === 'logs'")
      a-layout-content.layout-content(v-show="!logsDrawerVisible")
        a-card.drilldown-main-pane.gpt-results-pane(:bordered="false")
          .drilldown-home-main
            keep-alive
              LogsOverview(v-if="!logsDrawerVisible")
      .drilldown-detail-shell(v-if="logsDrawerVisible")

      a-drawer.metric-detail-drawer.logs-detail-drawer(
        popup-container=".drilldown-body--logs"
        placement="right"
        width="100%"
        :visible="logsDrawerVisible"
        :footer="false"
        :mask="false"
        :closable="false"
        :esc-to-close="true"
        :unmount-on-close="true"
        @cancel="closeLogsDrawer"
        @update:visible="onLogsDrawerVisible"
      )
        template(#title)
          .logs-drawer-heading
            .logs-drawer-crumb
              DrawerBreadcrumb(:items="logsDetailCrumbs")
              button.logs-drawer-close(type="button" :aria-label="t('common.close')" @click="closeLogsDrawer")
                icon-close
            .logs-drawer-toolbar.logs-drawer-toolbar--filters
              LogsDetailFilters
            nav.logs-drawer-tabs(role="tablist" aria-label="Logs detail")
              button.logs-drawer-tab(
                v-for="item in logsDetailTabs"
                :key="item.value"
                type="button"
                role="tab"
                :class="{ active: logsTab === item.value }"
                :aria-selected="logsTab === item.value"
                @click="setLogsTab(item.value)"
              ) {{ item.label }}
        LogsDetail(v-if="logsDrawerVisible")

      a-drawer.metric-detail-drawer.traces-gantt-drawer(
        popup-container=".drilldown-body--logs"
        placement="right"
        width="100%"
        :visible="tracesGanttVisible"
        :footer="false"
        :mask="false"
        :esc-to-close="true"
        :unmount-on-close="true"
        @cancel="closeTracesGanttDrawer"
        @update:visible="onTracesGanttDrawerVisible"
      )
        template(#title)
          .drawer-title
            .drawer-title-text
              DrawerBreadcrumb(:items="logsGanttCrumbs")
              span.drawer-metric-original {{ t('drilldown.traces.ganttDrawerTitle') }}
        TracesGantt(v-if="tracesGanttVisible")

    .drilldown-body.new-layout.new-layout--workspace.drilldown-body--traces(v-else-if="signal === 'traces'")
      a-layout-content.layout-content(v-show="!tracesHomeHidden")
        a-card.drilldown-main-pane.gpt-results-pane(:bordered="false")
          .drilldown-home-main
            keep-alive
              TracesHome(v-if="!tracesHomeHidden")
      .drilldown-detail-shell(v-if="tracesHomeHidden")

      a-drawer.metric-detail-drawer.logs-detail-drawer(
        popup-container=".drilldown-body--traces"
        placement="right"
        width="100%"
        :visible="logsFromTraceVisible"
        :footer="false"
        :mask="false"
        :closable="false"
        :esc-to-close="true"
        :unmount-on-close="true"
        @cancel="closeLogsForTraceDrawer"
        @update:visible="onLogsForTraceDrawerVisible"
      )
        template(#title)
          .logs-drawer-heading
            .logs-drawer-toolbar
              .logs-drawer-trace
                span.drawer-metric-name(:title="logsTraceIdLabel") {{ logsTraceIdLabel }}
              button.logs-drawer-close(type="button" :aria-label="t('common.close')" @click="closeLogsForTraceDrawer")
                icon-close
            nav.logs-drawer-tabs(role="tablist" aria-label="Logs detail")
              button.logs-drawer-tab(
                v-for="item in logsDetailTabs"
                :key="item.value"
                type="button"
                role="tab"
                :class="{ active: logsTab === item.value }"
                :aria-selected="logsTab === item.value"
                @click="setLogsTab(item.value)"
              ) {{ item.label }}
        LogsDetail(v-if="logsFromTraceVisible")

      a-drawer.metric-detail-drawer.traces-gantt-drawer(
        popup-container=".drilldown-body--traces"
        placement="right"
        width="100%"
        :visible="tracesGanttVisible"
        :footer="false"
        :mask="false"
        :esc-to-close="true"
        :unmount-on-close="true"
        @cancel="closeTracesGanttDrawer"
        @update:visible="onTracesGanttDrawerVisible"
      )
        template(#title)
          .drawer-title
            .drawer-title-text
              span.drawer-metric-name(:title="focusTraceIdLabel") {{ focusTraceIdLabel }}
              span.drawer-metric-original {{ t('drilldown.traces.ganttDrawerTitle') }}
        TracesGantt(v-if="tracesGanttVisible")
</template>

<script setup lang="ts">
  import { computed, ref, watch } from 'vue'
  import { useI18n } from 'vue-i18n'
  import { useRoute, useRouter } from 'vue-router'
  import { useDrilldownContextProvider } from '@/observability/context'
  import { LOGS_DETAIL_TABS } from '@/observability/types'
  import resolveMetricMeta from '@/observability/resolve-metric-meta'
  import useDrilldownUrlSync from '@/observability/use-drilldown-url-sync'
  import useDrilldownLogsInit from '@/observability/use-drilldown-logs-init'
  import useDrilldownTracesInit from '@/observability/use-drilldown-traces-init'
  import DrawerBreadcrumb from './components/drawer-breadcrumb.vue'
  import DrilldownTopBar from './components/top-bar.vue'
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
      const meta = await resolveMetricMeta(name)
      if (ctx.metric.value === name) {
        metricOriginalName.value = meta.originalName
      }
    },
    { immediate: true }
  )

  const closeDrawer = () => {
    ctx.metric.value = undefined
  }

  const onDrawerVisible = (visible: boolean) => {
    if (!visible) {
      closeDrawer()
    }
  }

  const closeLogsDrawer = () => {
    ctx.closeLogsDetail()
  }

  const onLogsDrawerVisible = (visible: boolean) => {
    if (!visible) {
      closeLogsDrawer()
    }
  }

  const closeLogsForTraceDrawer = () => {
    ctx.closeLogsForTrace()
  }

  const onLogsForTraceDrawerVisible = (visible: boolean) => {
    if (!visible) {
      closeLogsForTraceDrawer()
    }
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

  const onTracesGanttDrawerVisible = (visible: boolean) => {
    if (!visible) {
      closeTracesGanttDrawer()
    }
  }
</script>

<style scoped lang="less">
  // Explicit viewport height on the page root. Do not rely on nested percentage
  // height through app-layout — that chain is 0 on hard refresh.
  .drilldown-page.query-container {
    height: calc(100vh - var(--gpt-gap-3xl));
    max-height: calc(100vh - var(--gpt-gap-3xl));
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .drilldown-content-wrapper {
    flex: 1 1 0%;
    min-height: 0;
    height: 100%;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  // Top bar must not steal flex growth (stack's `.arco-card:last-child { flex:1 }`
  // is irrelevant here because body is the last child, but keep this explicit).
  .drilldown-top-card {
    flex: 0 0 auto;
  }

  .drilldown-body.new-layout {
    position: relative;
    display: flex;
    flex: 1 1 0%;
    flex-direction: row;
    flex-wrap: nowrap;
    min-height: 0;
    // Override global `.new-layout { height: 100% }` which collapses this nested pane to 0.
    height: auto;
    overflow: hidden;
    background: var(--gpt-bg-app);

    :deep(> .arco-resizebox) {
      flex: 0 0 auto;
      align-self: stretch;
      height: auto;
      min-height: 0;
      overflow: hidden;
    }

    > .layout-content {
      flex: 1 1 0%;
      align-self: stretch;
      min-width: 0;
      min-height: 0;
      height: auto;
      overflow: hidden;
      background: var(--gpt-bg-app);
    }
  }

  :deep(.arco-layout-sider),
  :deep(.arco-layout-sider-light) {
    box-shadow: none !important;
    background: var(--gpt-bg-panel);
  }

  .drilldown-sidebar-card {
    height: 100%;
    border-radius: 0;

    :deep(> .arco-card-body) {
      display: flex;
      flex-direction: column;
      height: 100%;
      min-height: 0;
      padding: 0;
      overflow: hidden;
    }
  }

  .layout-content {
    display: flex;
    flex: 1 1 0%;
    flex-direction: column;
    min-width: 0;
    min-height: 0;
    overflow: hidden;
  }

  .drilldown-main-pane {
    display: flex;
    flex-direction: column;
    flex: 1 1 0%;
    height: 100%;
    min-height: 0;
    overflow: hidden;
    border-radius: 0;
    box-shadow: none;
    background: var(--gpt-bg-panel);

    :deep(> .arco-card-body) {
      display: flex;
      flex-direction: column;
      flex: 1 1 0%;
      height: 100%;
      min-height: 0;
      padding: 0;
      overflow: hidden;
    }
  }

  .drilldown-home-main {
    display: flex;
    flex: 1 1 0%;
    flex-direction: column;
    min-height: 0;
    overflow: hidden;
  }

  // Keeps popup-container sized when overview is unmounted for the detail virtual route.
  .drilldown-detail-shell {
    flex: 1 1 0%;
    align-self: stretch;
    min-width: 0;
    min-height: 0;
  }

  .drilldown-signal-placeholder {
    display: flex;
    flex: 1 1 0%;
    align-items: center;
    justify-content: center;
    min-height: 0;
    background: var(--gpt-bg-app);
  }

  .drawer-title {
    display: flex;
    align-items: center;
    justify-content: space-between;
    width: 100%;
    min-width: 0;
    gap: var(--gpt-gap-lg);
  }

  .logs-drawer-heading {
    display: flex;
    flex-direction: column;
    width: 100%;
    min-width: 0;
  }

  .logs-drawer-crumb {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--gpt-gap-sm);
    box-sizing: border-box;
    min-width: 0;
    min-height: calc(var(--gpt-control-height-sm) + var(--gpt-gap-sm));
    padding: var(--gpt-gap-sm) var(--gpt-page-padding-x);
    border-bottom: 1px solid var(--color-border-2);
  }

  .logs-drawer-trace {
    display: flex;
    align-items: center;
    box-sizing: border-box;
    width: 100%;
    min-width: 0;
    min-height: calc(var(--gpt-control-height-sm) + var(--gpt-gap-sm) * 2);
    padding: var(--gpt-gap-sm) var(--gpt-page-padding-x);
    padding-right: calc(28px + var(--gpt-page-padding-x) + var(--gpt-gap-sm));
    border-bottom: 1px solid var(--color-border-2);
  }

  .logs-drawer-toolbar {
    position: relative;
    width: 100%;
    min-height: calc(var(--gpt-control-height-sm) + var(--gpt-gap-sm) * 2);
  }

  /* The filters bar hides itself while the logs field map is still resolving; without this
     the wrapper would keep a control row of empty height. */
  .logs-drawer-toolbar--filters {
    min-height: 0;
  }

  .logs-drawer-toolbar > .logs-drawer-close {
    position: absolute;
    top: var(--gpt-gap-sm);
    right: var(--gpt-gap-md);
  }

  .logs-drawer-close {
    position: static;
    flex-shrink: 0;
    z-index: 1;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    padding: 0;
    border: 0;
    border-radius: var(--gpt-radius-sm);
    background: transparent;
    color: var(--color-text-2);
    font-size: var(--gpt-font-xl);
    line-height: 1;
    cursor: pointer;

    &:hover {
      color: var(--color-text-1);
      background-color: var(--color-fill-2);
    }
  }

  .logs-drawer-tabs {
    display: flex;
    flex-shrink: 0;
    align-items: stretch;
    height: 37px;
    min-width: 0;
  }

  .logs-drawer-tab {
    position: relative;
    display: inline-flex;
    align-items: center;
    height: 100%;
    padding: 0 var(--gpt-page-padding-x);
    border: 0;
    background: transparent;
    color: var(--gpt-text-secondary);
    font-family: inherit;
    font-size: var(--gpt-font-base);
    line-height: 1;
    cursor: pointer;

    &.active {
      color: var(--brand-color);
      font-weight: 600;
    }

    &.active::after {
      content: '';
      position: absolute;
      right: 0;
      bottom: 0;
      left: 0;
      height: 2px;
      background: var(--brand-color);
    }
  }

  .drawer-title-text {
    display: flex;
    flex: 1 1 auto;
    flex-direction: row;
    align-items: baseline;
    gap: var(--gpt-gap-md);
    min-width: 0;
  }

  .drawer-metric-name {
    flex: 0 1 auto;
    min-width: 0;
    overflow: hidden;
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace;
    font-size: var(--gpt-font-md);
    font-weight: var(--gpt-font-weight-control);
    line-height: 1.3;
    color: var(--color-text-1);
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .drawer-metric-original {
    flex: 0 1 auto;
    min-width: 0;
    overflow: hidden;
    font-size: var(--gpt-font-sm);
    line-height: 1.3;
    color: var(--color-text-3);
    text-overflow: ellipsis;
    white-space: nowrap;
  }
</style>

<style lang="less">
  // Full-bleed over list/sidebar; Topbar stays outside popup-container.
  // Unscoped: drawer teleports into .drilldown-body, so scoped :deep misses it.
  .drilldown-body .arco-drawer {
    border: none !important;
  }

  .drilldown-body .metric-detail-drawer .arco-drawer-body {
    display: flex;
    flex-direction: column;
    padding: 0 !important;
    overflow: hidden;
  }

  // Header chrome band — distinguishes detail mode without a full drawer border.
  .drilldown-body .metric-detail-drawer .arco-drawer-header {
    background: var(--gpt-bg-header);
    border-bottom: 1px solid var(--color-border-2);

    // Title slot must stretch so actions sit at the far right (before close).
    .arco-drawer-title {
      flex: 1 1 auto;
      min-width: 0;
      margin-right: 0;
    }

    // More gap from Explore + clearer close affordance (default is 8px / 12px).
    .arco-drawer-close-btn {
      display: inline-flex;
      flex-shrink: 0;
      align-items: center;
      justify-content: center;
      width: 28px;
      height: 28px;
      margin-left: var(--gpt-page-padding-x);
      color: var(--color-text-2);
      font-size: var(--gpt-font-xl);
      line-height: 1;
      border-radius: var(--gpt-radius-sm);
      cursor: pointer;

      &:hover {
        color: var(--color-text-1);
        background-color: var(--color-fill-2);
      }

      .arco-icon,
      .arco-icon-hover {
        font-size: var(--gpt-font-xl);
      }
    }
  }

  // Above logs detail when both drawers are open (trace click from the detail table).
  .drilldown-body .traces-gantt-drawer {
    z-index: 1002;
  }

  // Logs detail: close lives in the heading so the filter rule spans the full header.
  .drilldown-body .logs-detail-drawer .arco-drawer-header {
    align-items: stretch;
    height: auto;
    min-height: 37px;
    padding: 0;

    .arco-drawer-title {
      display: flex;
      flex: 1 1 auto;
      flex-direction: column;
      align-items: stretch;
      width: 100%;
      height: auto;
      overflow: visible;
    }
  }
</style>
