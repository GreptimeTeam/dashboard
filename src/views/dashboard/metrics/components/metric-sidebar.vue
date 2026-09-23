<template lang="pug">
a-card.metrics-sidebar.gpt-page-sidebar.gpt-sidebar-header-card(:bordered="false")
  template(#title)
    a-space.metric-sidebar-title(fill :size="10")
      span.gpt-sidebar-heading
        | {{ $t('metrics.sidebar.title') }}
        a-tooltip(v-if="metricCountTooltip" :content="metricCountTooltip")
          span.gpt-sidebar-count {{ metricCountLabel }}
        span.gpt-sidebar-count(v-else) {{ metricCountLabel }}
      a-button.metric-sidebar-refresh(
        type="text"
        size="mini"
        :loading="loading"
        @click="refreshData"
      )
        template(#icon)
          svg.icon-11.brand-color
            use(href="#refresh")

  a-spin(style="width: 100%" :loading="loading")
    .metric-search
      a-select.metric-db-select(
        v-model="metricsDatabase"
        size="mini"
        allow-search
        :options="databaseOptions"
        :placeholder="$t('dashboard.database')"
        :aria-label="$t('dashboard.database')"
        @popup-visible-change="onDatabasePopup"
      )
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
    a-tree.metrics-tree(
      v-if="metricsTreeData.length"
      size="small"
      show-line
      action-on-node-click="expand"
      :block-node="true"
      :data="metricsTreeData"
      :load-more="loadMore"
      :animation="false"
    )
      template(#switcher-icon="nodeData")
        svg.icon-11.icon-color(v-if="!nodeData.isLeaf")
          use(href="#down")
      template(#title="nodeData")
        .tree-data
          a-tooltip(v-if="nodeData.type === 'label'" content="LABEL")
            svg.icon-11.metric-tree-icon--label
              use(href="#primary-key")
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
  import { storeToRefs } from 'pinia'
  import { useI18n } from 'vue-i18n'
  import { getLabelNames, getMetricNames, getLabelValues, METRIC_NAMES_LIMIT, searchMetricNames } from '@/api/metrics'
  import { useAppStore } from '@/store'
  import { useSignalDatabase } from '@/observability/signal-database'
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

  const { t } = useI18n()
  const appStore = useAppStore()
  const { databaseList } = storeToRefs(appStore)
  const metricsDatabase = useSignalDatabase('metrics')

  const metrics = ref<Array<{ name: string }>>([])
  const metricsTreeData = ref<MetricTreeNode[]>([])
  const metricSearchKey = ref('')
  const loading = ref(false)

  const databaseOptions = computed(() => {
    const current = metricsDatabase.value
    const names = databaseList.value.length ? [...databaseList.value] : []
    if (current && !names.includes(current)) {
      names.unshift(current)
    }
    return names.map((name) => ({ label: name, value: name }))
  })

  const onDatabasePopup = (visible: boolean) => {
    if (visible && databaseList.value.length === 0) {
      appStore.refreshDatabaseList()
    }
  }

  const displayedMetricCount = computed(() => metrics.value.length)
  const isMetricSearchActive = computed(() => metricSearchKey.value.trim().length > 0)
  const isMetricCountCapped = computed(() => displayedMetricCount.value >= METRIC_NAMES_LIMIT)

  const metricCountLabel = computed(() => {
    const count = displayedMetricCount.value
    if (isMetricSearchActive.value) {
      return isMetricCountCapped.value
        ? t('metrics.sidebar.countMatchesCapped', { count: METRIC_NAMES_LIMIT })
        : t('metrics.sidebar.countMatches', { count })
    }
    return isMetricCountCapped.value
      ? t('metrics.sidebar.countShownCapped', { count: METRIC_NAMES_LIMIT })
      : t('metrics.sidebar.countShown', { count })
  })

  const metricCountTooltip = computed(() => t('metrics.sidebar.countTooltip', { limit: METRIC_NAMES_LIMIT }))

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
      const response = await getMetricNames({ database: metricsDatabase.value })
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
      const response = await searchMetricNames(regex, metricsDatabase.value)
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
        const response = await getLabelNames({
          match: nodeData.metricName,
          database: metricsDatabase.value,
        })
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
        const response = await getLabelValues(nodeData.labelName, {
          match: nodeData.metricName,
          database: metricsDatabase.value,
        })
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

  onMounted(async () => {
    if (databaseList.value.length === 0) {
      appStore.refreshDatabaseList()
    }
    await getMetrics()
  })

  watch(metricSearchKey, (query) => {
    debouncedSearch(query)
  })

  watch(metricsDatabase, () => {
    refreshData()
  })
</script>

<style scoped lang="less">
  .metric-search {
    display: flex;
    flex-direction: column;
    align-items: stretch;
    gap: 6px;
    padding: 8px 10px;
  }

  /* The a-select root never inherits this component's scope id, and arco renders the
     select + view classes on one element, so pin both controls through the scoped
     .metric-search anchor — root-scoped selectors silently never match. Arco's own mini
     input math (negative padding dropped at 20px) cannot match select heights either. */
  .metric-search :deep(.metric-db-select),
  .metric-search :deep(.arco-input-wrapper.search-metric) {
    box-sizing: border-box;
    width: 100%;
    height: var(--gpt-control-height-sm);
    min-height: var(--gpt-control-height-sm);
    padding: 0 10px;
    border: 1px solid var(--gpt-border-strong);
    border-radius: var(--gpt-radius-sm);
    background: var(--gpt-bg-app);
  }

  .metric-search :deep(.arco-input-wrapper.search-metric > .arco-input-prefix) {
    padding-right: 10px;
  }

  .metric-search :deep(.arco-input-wrapper.search-metric > .arco-input-suffix) {
    padding-left: 8px;
  }

  .metric-search-left {
    width: 100%;
  }

  .metric-sidebar-title {
    width: 100%;
  }

  .metric-sidebar-refresh.arco-btn-text.arco-btn-only-icon {
    width: var(--gpt-control-height-sm);
    height: var(--gpt-control-height-sm);
    padding: 0;
    border: none;
    background: transparent;
  }

  .empty {
    display: flex;
    align-items: center;
    justify-content: center;
    height: calc(100% - 68px);
  }
</style>
