<template lang="pug">
.query-layout.query-layout--stack.drilldown-page.query-container
  .content-wrapper.query-layout-cards.drilldown-content-wrapper
    a-card.drilldown-top-card(:bordered="false")
      DrilldownTopBar

    .drilldown-body.new-layout.new-layout--workspace(v-if="signal === 'metrics'")
      a-resize-box(
        v-model:width="sidebarWidth"
        :directions="['right']"
        :style="{ 'min-width': '100px', 'max-width': '40vw' }"
        :class="hideSidebar ? 'hide-sider' : ''"
      )
        a-layout-sider(style="height: 100%" :width="actualSidebarWidth")
          a-card.gpt-page-sidebar.drilldown-sidebar-card(:bordered="false")
            MetricsSidebar(
              v-model:search="search"
              v-model:sort="sort"
              :prefix-groups="prefixGroups"
              :suffix-groups="suffixGroups"
              :metric-names="metricNames"
              :loading="loading"
              :pool-count="poolCount"
              :filtered-count="filteredCount"
            )

      a-layout-content.layout-content
        a-card.drilldown-main-pane.gpt-results-pane(:bordered="false")
          .drilldown-home-main
            MetricChartList(
              :loading="loading"
              :error="error"
              :truncated="truncated"
              :groups="groups"
            )

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
            span.drawer-metric-name(:title="selectedMetric") {{ selectedMetric }}
        MetricDetail(v-if="selectedMetric" :metric="selectedMetric")

    .drilldown-signal-placeholder(v-else)
      a-empty(:description="placeholderDescription")
</template>

<script setup lang="ts">
  import { computed, ref } from 'vue'
  import { useI18n } from 'vue-i18n'
  import { useRoute, useRouter } from 'vue-router'
  import { useStorage } from '@vueuse/core'
  import { storeToRefs } from 'pinia'
  import { useAppStore } from '@/store'
  import { useDrilldownContextProvider } from '@/observability/context'
  import type { MetricsSortOption } from '@/observability/metrics/catalog'
  import useDrilldownUrlSync from '@/observability/use-drilldown-url-sync'
  import useMetricsCatalog from '@/observability/use-metrics-catalog'
  import useDrilldownLogsInit from '@/observability/use-drilldown-logs-init'
  import DrilldownTopBar from './components/top-bar.vue'
  import MetricsSidebar from './metrics/metrics-sidebar.vue'
  import MetricChartList from './metrics/metric-chart-list.vue'
  import MetricDetail from './metrics/metric-detail.vue'

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

  const { signal } = ctx
  const selectedMetric = computed(() => ctx.metric.value)
  const drawerVisible = computed(() => Boolean(selectedMetric.value))

  const closeDrawer = () => {
    ctx.metric.value = undefined
  }

  const onDrawerVisible = (visible: boolean) => {
    if (!visible) {
      closeDrawer()
    }
  }

  const placeholderDescription = computed(() => {
    if (signal.value === 'logs') {
      return t('drilldown.signals.logsPlaceholder')
    }
    return t('drilldown.signals.tracesPlaceholder')
  })

  const search = ref('')
  const sort = ref<MetricsSortOption>('default')
  const { prefixGroups, suffixGroups, metricNames, truncated, loading, error, groups, poolCount, filteredCount } =
    useMetricsCatalog(ctx, search, sort)

  const sidebarWidth = useStorage('drilldown-sidebar-width', 228)
  const { hideSidebar } = storeToRefs(useAppStore())

  const actualSidebarWidth = computed(() => {
    const minWidth = 180
    const maxWidth = window.innerWidth * 0.4
    return Math.max(minWidth, Math.min(sidebarWidth.value, maxWidth))
  })
</script>

<style scoped lang="less">
  // Explicit viewport height on the page root. Do not rely on nested percentage
  // height through app-layout — that chain is 0 on hard refresh.
  .drilldown-page.query-container {
    height: calc(100vh - 30px);
    max-height: calc(100vh - 30px);
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
    min-width: 0;
  }

  .drawer-metric-name {
    display: block;
    max-width: min(56vw, 520px);
    overflow: hidden;
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace;
    font-size: 13px;
    font-weight: 600;
    line-height: 1.3;
    color: var(--color-text-1);
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  :deep(.metric-detail-drawer.arco-drawer) {
    .arco-drawer-body {
      display: flex;
      flex-direction: column;
      padding: 0;
      overflow: hidden;
    }
  }
</style>

<style lang="less">
  // Full-bleed over list/sidebar; Topbar stays outside popup-container.
  // Border matches LogDetail drawer edge treatment.
  .drilldown-body .arco-drawer {
    border: 1px solid var(--color-neutral-3) !important;
  }
</style>
