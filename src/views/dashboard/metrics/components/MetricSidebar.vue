<template lang="pug">
a-card.metrics-sidebar(:bordered="false")
  template(#title)
    a-space(:size="10")
      | Metrics
      a-button(
        type="outline"
        size="small"
        :loading="loading"
        @click="refreshData"
      )
        template(#icon)
          svg.icon.brand-color
            use(href="#refresh")
  template(#extra)
    a-button(type="text" size="mini" @click="showMetricsExplorer = true")
      template(#icon)
        icon-search
      | Browse

  .metrics-section
    .metric-select-container
      a-select(
        v-model="selectedMetric"
        allow-search
        placeholder="Search metrics..."
        size="small"
        allow-clear
        :options="metricOptions"
        :loading="loading"
        @search="onMetricSearch"
      )
      a-button.insert-metric-button(
        v-if="selectedMetric"
        type="text"
        size="small"
        :title="`Insert metric: ${selectedMetric}`"
        @click="insertSelectedMetric"
      )
        template(#icon)
          icon-plus

    // Metrics Explorer Modal
    MetricsExplorer(
      v-model:visible="showMetricsExplorer"
      :metrics="metrics"
      :loading="loading"
      @select="selectMetricFromExplorer"
    )

    a-tree.metrics-tree(
      v-model:expanded-keys="expandedKeys"
      size="small"
      action-on-node-click="expand"
      :block-node="true"
      :data="metricsTreeData"
      :load-more="loadLabelValues"
      :animation="false"
    )
      template(#switcher-icon="nodeData")
        svg.icon-16.icon-color(v-if="!nodeData.isLeaf")
          use(href="#down")
      template(#title="nodeData")
        .tree-data
          .data-title {{ nodeData.title }}
          MetricMenu(
            :nodeData="nodeData"
            @copyText="$emit('copyText', $event)"
            @insertText="$emit('insertText', $event)"
          )
</template>

<script setup lang="ts">
  import { ref, computed, watch, nextTick, onMounted } from 'vue'
  import { useLocalStorage } from '@vueuse/core'
  import { useStorage } from '@vueuse/core'
  import { IconSearch, IconLoading } from '@arco-design/web-vue/es/icon'
  import { getLabelNames } from '@/api/metrics'
  import { useAppStore } from '@/store'
  import { useMetrics } from '@/hooks/use-metrics'
  import MetricMenu from './MetricMenu.vue'
  import MetricsExplorer from './MetricsExplorer.vue'

  const emit = defineEmits<{
    (e: 'copyText', text: string): void
    (e: 'insertText', text: string): void
  }>()

  // Use the metrics composable
  const { metrics, loading, fetchMetrics, fetchLabels, fetchLabelValues, searchMetrics } = useMetrics()

  // Sidebar state
  const sidebarWidth = useStorage('metrics-sidebar-width', 320)
  const selectedMetric = useLocalStorage<string | null>('metrics-explorer-last-selected', null)
  const expandedKeys = ref<string[]>([])

  // Local state for labels
  const labels = ref<any[]>([])

  // Metrics explorer state
  const showMetricsExplorer = ref(false)

  // Computed properties
  const metricOptions = computed(() => {
    return metrics.value.map((metric) => ({
      label: metric.name,
      value: metric.name,
    }))
  })

  // Methods
  // Fetch labels for a specific metric and store locally
  const fetchLabelsForMetric = async (metricName: string) => {
    try {
      const response = await getLabelNames(metricName)
      if (response && response.data) {
        labels.value = response.data
          .filter((name: string) => name !== '__name__')
          .map((name: string) => ({ name, values: [] }))
      } else {
        labels.value = []
      }
    } catch (error) {
      console.error('Error fetching labels:', error)
      labels.value = []
    }
  }

  const onMetricSearch = async (query: string) => {
    if (query.trim()) {
      await searchMetrics(query)
    }
  }

  const selectMetricFromExplorer = (metricName: string) => {
    selectedMetric.value = metricName
    showMetricsExplorer.value = false
    if (metricName) {
      fetchLabelsForMetric(metricName)
    }
  }

  const refreshData = async () => {
    await fetchMetrics()
  }

  const onExpand = (keys: string[]) => {
    // Handle tree expansion if needed
  }

  const handleCopyText = (text: string) => {
    emit('copyText', text)
  }

  const handleInsertText = (text: string) => {
    emit('insertText', text)
  }

  const metricsTreeData = ref<any[]>([])
  const buildTreeForSelectedMetric = () => {
    if (!selectedMetric.value) {
      metricsTreeData.value = []
      return
    }
    metricsTreeData.value = (labels.value || []).map((label) => ({
      key: `label-${selectedMetric.value}-${label.name}`,
      title: label.name,
      type: 'label',
      metricName: selectedMetric.value,
      labelName: label.name,
      isLeaf: false,
      children: [],
    }))
  }

  watch(labels, (newMetric) => {
    buildTreeForSelectedMetric()
  })

  const loadLabelValues = async (nodeData: any) => {
    if (nodeData.type === 'label' && !nodeData.children?.length) {
      const values = await fetchLabelValues(nodeData.labelName, nodeData.metricName)
      nodeData.children = values.map((value: string) => ({
        key: `value-${nodeData.metricName}-${nodeData.labelName}-${value}`,
        title: value,
        type: 'value',
        metricName: nodeData.metricName,
        labelName: nodeData.labelName,
        value,
        isLeaf: true,
      }))
      metricsTreeData.value = [...metricsTreeData.value]
      await nextTick()
    }
  }

  const insertSelectedMetric = () => {
    if (selectedMetric.value) {
      emit('insertText', selectedMetric.value)
    }
  }

  onMounted(async () => {
    await fetchMetrics()
  })

  watch(
    () => selectedMetric.value,
    (newMetric) => {
      if (newMetric) {
        fetchLabelsForMetric(newMetric)
      }
    },
    {
      immediate: true,
    }
  )
</script>

<style scoped lang="less">
  .metric-select-container {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 16px;

    .a-select {
      flex: 1;
    }

    .copy-metric-button {
      width: 28px;
      height: 28px;
      padding: 0;
      display: flex;
      align-items: center;
      justify-content: center;

      .icon {
        width: 14px;
        height: 14px;
      }
    }
  }

  .tree-data {
    display: flex;
    justify-content: space-between;
    position: relative;
    align-items: center;
  }
  :deep(.arco-tree-node-title-text) {
    width: 100%;
  }

  :deep(.arco-tree-node-switcher) {
    width: 16px;
  }
  .metrics-section {
    height: 100%;
    background: var(--color-bg-container);
    border-right: 1px solid var(--color-border);
    overflow-y: auto;
    padding: 0 15px;
  }
  // Tree node styling to match query sidebar
  :deep(.metrics-tree) {
    .data-title {
      color: var(--main-font-color);
    }
    .arco-tree-node.arco-tree-node-is-leaf .data-title {
      color: var(--small-font-color);
    }
    .label-count {
      color: var(--small-font-color);
    }
    .arco-tree-node-indent-block {
      margin-right: 0;
    }
    .arco-tree-node-title:hover {
      background: transparent;
      .menu-button {
        visibility: visible;
      }
    }
    .arco-tree-node.arco-tree-node-is-leaf:hover {
      background: var(--tree-select-brand-color);
      .menu-button {
        visibility: visible;
      }
    }
    .arco-tree-node-is-leaf {
      .arco-tree-node-switcher {
        width: auto;
      }
    }
    .arco-tree-node {
      padding: 0 0 0 0;
      line-height: 30px;
      border-radius: 0;

      &.arco-tree-node-is-leaf.arco-tree-node-is-tail {
        margin-bottom: 8px;
      }
    }

    .arco-tree-node-title {
      padding: 0 6px;
    }

    .arco-tree-node-switcher {
      width: 16px;
      margin: 0;
    }

    .arco-tree-node:not(.arco-tree-node-is-leaf) {
      border-radius: 0;
    }

    .arco-tree-node.arco-tree-node-is-leaf .arco-tree-node-title {
      padding: 0 10px;
      border-radius: 0;
    }
  }
</style>
