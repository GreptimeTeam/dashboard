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
            .drawer-title-text
              span.drawer-metric-name(:title="selectedMetric") {{ selectedMetric }}
              span.drawer-metric-original(v-if="metricOriginalName" :title="metricOriginalName") {{ metricOriginalName }}
            MetricDetailActions(v-if="selectedMetric" :metric="selectedMetric")
        MetricDetail(v-if="selectedMetric" :metric="selectedMetric")

    .drilldown-signal-placeholder(v-else)
      a-empty(:description="placeholderDescription")
</template>

<script setup lang="ts">
  import { computed, ref, watch } from 'vue'
  import { useI18n } from 'vue-i18n'
  import { useRoute, useRouter } from 'vue-router'
  import { useStorage } from '@vueuse/core'
  import { storeToRefs } from 'pinia'
  import { useAppStore } from '@/store'
  import { useDrilldownContextProvider } from '@/observability/context'
  import type { MetricsSortOption } from '@/observability/metrics/catalog'
  import resolveMetricMeta from '@/observability/resolve-metric-meta'
  import useDrilldownUrlSync from '@/observability/use-drilldown-url-sync'
  import useMetricsCatalog from '@/observability/use-metrics-catalog'
  import useDrilldownLogsInit from '@/observability/use-drilldown-logs-init'
  import DrilldownTopBar from './components/top-bar.vue'
  import MetricsSidebar from './metrics/metrics-sidebar.vue'
  import MetricChartList from './metrics/metric-chart-list.vue'
  import MetricDetail from './metrics/metric-detail.vue'
  import MetricDetailActions from './metrics/metric-detail-actions.vue'

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
    height: calc(100vh - 24px);
    max-height: calc(100vh - 24px);
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
    justify-content: space-between;
    width: 100%;
    min-width: 0;
    gap: 12px;
  }

  .drawer-title-text {
    display: flex;
    flex: 1 1 auto;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }

  .drawer-metric-name {
    display: block;
    min-width: 0;
    overflow: hidden;
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace;
    font-size: 13px;
    font-weight: 600;
    line-height: 1.3;
    color: var(--color-text-1);
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .drawer-metric-original {
    display: block;
    min-width: 0;
    overflow: hidden;
    font-size: 11px;
    line-height: 1.2;
    color: var(--color-text-3);
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  :deep(.metric-detail-drawer.arco-drawer) {
    .arco-drawer-header {
      .arco-drawer-title {
        flex: 1;
        min-width: 0;
        margin-right: 0;
      }
    }

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
  // No drawer border — avoids double edge with the list pane card.
  .drilldown-body .arco-drawer {
    border: none !important;
  }

  // Title slot must stretch so actions sit at the far right (before close).
  .drilldown-body .metric-detail-drawer .arco-drawer-header {
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
      margin-left: 16px;
      color: var(--color-text-2);
      font-size: 16px;
      line-height: 1;
      border-radius: var(--border-radius-small, 4px);
      cursor: pointer;

      &:hover {
        color: var(--color-text-1);
        background-color: var(--color-fill-2);
      }

      .arco-icon,
      .arco-icon-hover {
        font-size: 16px;
      }
    }
  }
</style>
