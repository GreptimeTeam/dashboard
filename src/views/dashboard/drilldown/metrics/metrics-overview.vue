<template lang="pug">
.metrics-overview
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
</template>

<script setup lang="ts">
  import { computed, ref } from 'vue'
  import { storeToRefs } from 'pinia'
  import { useAppStore } from '@/store'
  import { useDrilldownContext } from '@/observability/context'
  import type { MetricsSortOption } from '@/observability/metrics/catalog'
  import useMetricsCatalog from '@/observability/use-metrics-catalog'
  import MetricsSidebar from './metrics-sidebar.vue'
  import MetricChartList from './metric-chart-list.vue'

  defineOptions({
    name: 'MetricsOverview',
  })

  const ctx = useDrilldownContext()
  const search = ref('')
  const sort = ref<MetricsSortOption>('default')
  const { prefixGroups, suffixGroups, metricNames, truncated, loading, error, groups, poolCount, filteredCount } =
    useMetricsCatalog(ctx, search, sort, {
      enabled: () => !ctx.metric.value,
    })

  /** Session-scoped: the catalog sidebar width is a transient view tweak, not a saved pref. */
  const sidebarWidth = ref(228)
  const { hideSidebar } = storeToRefs(useAppStore())

  const actualSidebarWidth = computed(() => {
    const minWidth = 180
    const maxWidth = window.innerWidth * 0.4
    return Math.max(minWidth, Math.min(sidebarWidth.value, maxWidth))
  })
</script>

<style scoped lang="less">
  .metrics-overview {
    display: flex;
    flex: 1 1 0%;
    flex-direction: row;
    flex-wrap: nowrap;
    align-self: stretch;
    min-width: 0;
    min-height: 0;
    overflow: hidden;

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
</style>
