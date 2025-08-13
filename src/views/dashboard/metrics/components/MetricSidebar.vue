<template lang="pug">
.metric-sidebar
  .metric-select-container
    a-select(
      v-model="selectedMetric"
      allow-search
      placeholder="Search metrics..."
      size="small"
      allow-clear
      :filter-option="false"
      :options="metricOptions"
      :loading="loading"
      @search="onMetricSearch"
      @change="onMetricChange"
    )
    a-button.copy-metric-button(
      v-if="selectedMetric"
      type="text"
      size="small"
      :title="`Copy metric: ${selectedMetric}`"
      @click="insertSelectedMetric"
    )
      template(#icon)
        icon-plus

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
  import { computed, ref, watch, onMounted, nextTick } from 'vue'
  import { useMetrics } from '@/hooks/use-metrics'
  import MetricMenu from './MetricMenu.vue'

  const emit = defineEmits<{
    (e: 'copyText', text: string): void
    (e: 'insertText', text: string): void
  }>()

  const { metrics, labels, loading, fetchMetrics, fetchLabels, fetchLabelValues, searchMetrics } = useMetrics()

  const selectedMetric = ref<string | null>(null)
  const expandedKeys = ref<string[]>([])

  // Storage key for persisting last selected metric
  const STORAGE_KEY = 'metrics-explorer-last-selected'

  // Save selected metric to localStorage
  const saveSelectedMetric = (metricName: string | null) => {
    if (metricName) {
      localStorage.setItem(STORAGE_KEY, metricName)
    } else {
      localStorage.removeItem(STORAGE_KEY)
    }
  }

  // Load selected metric from localStorage
  const loadSelectedMetric = (): string | null => {
    try {
      return localStorage.getItem(STORAGE_KEY)
    } catch {
      return null
    }
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
  const onMetricChange = async (metricName: string) => {
    selectedMetric.value = metricName
    expandedKeys.value = []
    await fetchLabels(metricName)
    buildTreeForSelectedMetric()
  }

  // Auto-select logic: storage first, then first item in results
  const autoSelectMetric = () => {
    if (!metrics.value?.length) {
      return
    }

    const storedMetric = loadSelectedMetric()

    // Check if stored metric exists in current results
    if (storedMetric && metrics.value.some((m) => m.name === storedMetric)) {
      selectedMetric.value = storedMetric
      onMetricChange(storedMetric)
      return
    }

    // If no stored metric or it doesn't exist, select first item
    const firstMetric = metrics.value[0]?.name
    if (firstMetric) {
      selectedMetric.value = firstMetric
      onMetricChange(firstMetric)
    }
  }

  const metricOptions = computed(() => {
    return (metrics.value || []).map((m) => ({ label: m.name, value: m.name }))
  })

  watch(selectedMetric, (newMetric) => {
    buildTreeForSelectedMetric()
    saveSelectedMetric(newMetric)
  })
  watch(labels, buildTreeForSelectedMetric)

  // Watch for metrics changes and auto-select
  watch(
    metrics,
    () => {
      // Only auto-select if no metric is currently selected
      if (!selectedMetric.value) {
        autoSelectMetric()
      }
    },
    { flush: 'post' }
  )

  const onMetricSearch = async (text: string) => {
    const names = await searchMetrics(text)
    const set = new Set(names)
    const next = Array.from(set).map((name) => ({ name }))
    metrics.value = next as any

    // After search, auto-select if no current selection
    if (!selectedMetric.value && next.length > 0) {
      nextTick(() => {
        autoSelectMetric()
      })
    }
  }

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
    // Auto-select after initial fetch
    nextTick(() => {
      autoSelectMetric()
    })
  })
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
  .metric-sidebar {
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
