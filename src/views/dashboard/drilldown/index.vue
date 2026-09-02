<template lang="pug">
a-layout.new-layout.drilldown-page
  .drilldown-global-bar.gpt-query-strip
    DrilldownTopBar

  .drilldown-body.new-layout--workspace
    a-resize-box(
      v-model:width="sidebarWidth"
      :directions="['right']"
      :style="{ 'min-width': '100px', 'max-width': '40vw' }"
      :class="hideSidebar ? 'hide-sider' : ''"
    )
      a-layout-sider(style="height: 100%" :width="actualSidebarWidth")
        MetricsSidebar(:prefix-groups="prefixGroups" :suffix-groups="suffixGroups" :metric-names="metricNames")

    a-layout-content.layout-content
      a-card.drilldown-main-pane.gpt-results-pane(:bordered="false")
        MetricDetail(v-if="selectedMetric" :metric="selectedMetric")
        template(v-else)
          MetricsMainToolbar.gpt-results-toolbar(v-model:search="search" v-model:sort="sort")
          MetricNameList(
            :loading="loading"
            :error="error"
            :truncated="truncated"
            :groups="groups"
          )
</template>

<script setup lang="ts">
  import { computed, onMounted, ref } from 'vue'
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
  import MetricsMainToolbar from './metrics/main-toolbar.vue'
  import MetricNameList from './metrics/metric-name-list.vue'
  import MetricDetail from './metrics/metric-detail.vue'

  defineOptions({
    name: 'Drilldown',
  })

  const route = useRoute()
  const router = useRouter()
  const ctx = useDrilldownContextProvider()
  const urlSync = useDrilldownUrlSync(ctx, route, router)
  useDrilldownLogsInit(ctx)

  const selectedMetric = computed(() => ctx.metric.value)

  const search = ref('')
  const sort = ref<MetricsSortOption>('default')
  const { prefixGroups, suffixGroups, metricNames, truncated, loading, error, groups } = useMetricsCatalog(
    ctx,
    search,
    sort
  )

  const sidebarWidth = useStorage('drilldown-sidebar-width', 228)
  const { hideSidebar } = storeToRefs(useAppStore())

  const actualSidebarWidth = computed(() => {
    const minWidth = 180
    const maxWidth = window.innerWidth * 0.4
    return Math.max(minWidth, Math.min(sidebarWidth.value, maxWidth))
  })

  onMounted(() => {
    urlSync.initializeFromQuery()
  })
</script>

<style scoped lang="less">
  .drilldown-page {
    flex-direction: column;
    height: 100%;
    overflow: hidden;
  }

  .drilldown-global-bar {
    flex-shrink: 0;
    width: 100%;
    padding: 0;
  }

  .drilldown-body {
    display: flex;
    flex: 1;
    min-height: 0;
    overflow: hidden;
  }

  .layout-content {
    display: flex;
    flex-direction: column;
    min-width: 0;
    overflow: hidden;
  }

  .drilldown-main-pane {
    display: flex;
    flex-direction: column;
    flex: 1;
    min-height: 0;
    overflow: hidden;
  }
</style>
