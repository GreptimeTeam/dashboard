<template lang="pug">
a-card.metrics-sidebar.gpt-page-sidebar.gpt-sidebar-header-card(:bordered="false")
  template(#title)
    a-space(:size="10")
      | Metrics
      a-button(size="mini" :loading="loading" @click="refreshData")
        template(#icon)
          svg.icon-11.brand-color
            use(href="#refresh")

  a-spin(style="width: 100%" :loading="loading")
    .metric-search
      .metric-search-left
        a-input.search-metric(
          v-model="metricSearchKey"
          size="mini"
          placeholder="Search metrics..."
          :allow-clear="true"
        )
          template(#prefix)
            svg.icon-11.icon-color
              use(href="#search")
      span.metric-total {{ currentMetricCount }} metrics

    a-tree.metrics-tree(
      v-if="metricsTreeData.length"
      size="small"
      action-on-node-click="expand"
      :block-node="true"
      :data="metricsTreeData"
      :load-more="loadMore"
      :animation="false"
    )
      template(#icon="node")
        a-tooltip(v-if="getNodeIcon(node.node)" :content="node.node.type?.toUpperCase()")
          svg.icon
            use(:href="getNodeIcon(node.node)")
      template(#switcher-icon="nodeData")
        svg.icon-11.icon-color(v-if="!nodeData.isLeaf")
          use(href="#down")
      template(#title="nodeData")
        .tree-data
          .data-title(:title="nodeData.title") {{ nodeData.title }}
          MetricMenu(
            :nodeData="nodeData"
            @copyText="$emit('copyText', $event)"
            @insertText="$emit('insertText', $event)"
          )
    EmptyStatus.empty(v-else)
</template>

<script setup lang="ts">
  import { ref, computed, watch, nextTick, onMounted } from 'vue'
  import { useDebounceFn } from '@vueuse/core'
  import { getLabelNames, getMetricNames, getLabelValues, searchMetricNames } from '@/api/metrics'
  import { useAppStore } from '@/store'
  import MetricMenu from './metric-menu.vue'

  type MetricTreeNode = {
    key: string
    title: string
    type: 'metric' | 'label' | 'value'
    metricName: string
    labelName?: string
    value?: string
    isLeaf?: boolean
    children?: MetricTreeNode[]
  }

  defineEmits<{
    (e: 'copyText', text: string): void
    (e: 'insertText', text: string): void
  }>()

  const appStore = useAppStore()

  const metrics = ref<Array<{ name: string }>>([])
  const metricsTreeData = ref<MetricTreeNode[]>([])
  const metricSearchKey = ref('')
  const loading = ref(false)

  const currentMetricCount = computed(() => metricsTreeData.value.length)

  const buildMetricsTree = () => {
    metricsTreeData.value = metrics.value.map((metric) => ({
      key: `metric-${metric.name}`,
      title: metric.name,
      type: 'metric',
      metricName: metric.name,
      isLeaf: false,
      children: [],
    }))
  }

  const getMetrics = async () => {
    try {
      loading.value = true
      const response = await getMetricNames()
      metrics.value = (response.data || []).map((name: string) => ({ name }))
      buildMetricsTree()
    } catch (err) {
      console.error('Error fetching metrics:', err)
      metrics.value = []
      metricsTreeData.value = []
    } finally {
      loading.value = false
    }
  }

  const searchMetrics = async (query: string) => {
    const safe = query.trim()
    if (!safe) {
      await getMetrics()
      return
    }

    try {
      loading.value = true
      const regex = safe.replace(/"/g, '\\"')
      const response = await searchMetricNames(regex)
      metrics.value = (response.data || []).map((name: string) => ({ name }))
      buildMetricsTree()
    } catch (err) {
      console.error('Error remote searching metrics:', err)
      metrics.value = []
      metricsTreeData.value = []
    } finally {
      loading.value = false
    }
  }

  const debouncedSearch = useDebounceFn(searchMetrics, 300)

  const refreshData = async () => {
    await searchMetrics(metricSearchKey.value)
  }

  const loadMore = async (nodeData: MetricTreeNode) => {
    if (nodeData.type === 'metric' && !nodeData.children?.length) {
      try {
        const response = await getLabelNames(nodeData.metricName)
        nodeData.children = (response.data || [])
          .filter((name: string) => name !== '__name__')
          .map((name: string) => ({
            key: `label-${nodeData.metricName}-${name}`,
            title: name,
            type: 'label',
            metricName: nodeData.metricName,
            labelName: name,
            isLeaf: false,
            children: [],
          }))
        metricsTreeData.value = [...metricsTreeData.value]
        await nextTick()
      } catch (err) {
        console.error(`Error fetching labels for metric ${nodeData.metricName}:`, err)
      }
    } else if (nodeData.type === 'label' && nodeData.labelName && !nodeData.children?.length) {
      try {
        const response = await getLabelValues(nodeData.labelName, nodeData.metricName)
        nodeData.children = (response.data || []).map((value: string) => ({
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
      } catch (err) {
        console.error(`Error fetching values for label ${nodeData.labelName}:`, err)
      }
    }
  }

  const getNodeIcon = (node: MetricTreeNode) => {
    if (node.type === 'metric') return '#metric'
    if (node.type === 'label') return '#primary-key'
    if (node.type === 'value') return '#value'
    return ''
  }

  onMounted(async () => {
    await getMetrics()
  })

  watch(metricSearchKey, (query) => {
    debouncedSearch(query)
  })

  watch(
    () => appStore.database,
    () => {
      refreshData()
    }
  )
</script>

<style scoped lang="less">
  .metric-search {
    display: flex;
    flex-direction: column;
    align-items: stretch;
    gap: 6px;
    padding: 8px 10px;
  }

  .metric-search-left {
    width: 100%;
  }

  .arco-input-wrapper.search-metric {
    min-height: 30px;
    padding: 0 10px;
    border: 1px solid var(--gpt-border-strong);
    border-radius: var(--gpt-radius-sm);
    background: var(--gpt-bg-app);

    :deep(> .arco-input-prefix) {
      padding-right: 10px;
    }

    :deep(> .arco-input-suffix) {
      padding-left: 8px;
    }
  }

  .metric-total {
    color: var(--gpt-text-muted);
    font-size: 10px;
    white-space: nowrap;
  }

  .empty {
    display: flex;
    align-items: center;
    justify-content: center;
    height: calc(100% - 68px);
  }
</style>
