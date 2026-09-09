<template lang="pug">
.related-metrics-panel
  .related-metrics-controls
    .view-by
      span.control-label {{ t('drilldown.relatedMetrics.viewBy') }}
      a-select(
        v-model="viewByPrefix"
        size="small"
        :style="{ width: '260px' }"
        :placeholder="t('drilldown.relatedMetrics.viewByAll')"
      )
        a-option(value="all") {{ t('drilldown.relatedMetrics.viewByAll') }}
        a-option(v-for="group in prefixOptions" :key="group.value" :value="group.value") {{ group.label }} ({{ group.count }})
    a-input-search.search(
      v-model="search"
      allow-clear
      size="small"
      :placeholder="t('drilldown.relatedMetrics.searchPlaceholder')"
    )

  .related-metrics-list
    MetricChartList(
      :loading="loading"
      :error="error"
      :truncated="truncated"
      :groups="groups"
      :empty-description="t('drilldown.relatedMetrics.emptyDescription')"
    )
</template>

<script setup lang="ts">
  import { computed, ref, watch } from 'vue'
  import { useI18n } from 'vue-i18n'
  import { matchesSearch, type MetricGroup } from '@/observability/metrics/catalog'
  import { computeMetricPrefixGroups, matchesPrefix } from '@/observability/metrics/prefix-tree'
  import { sortRelatedMetrics } from '@/observability/metrics/sort-related-metrics'
  import MetricChartList from './metric-chart-list.vue'

  const VIEW_BY_ALL = 'all'

  const props = defineProps<{
    metric: string
    poolNames: string[]
    loading: boolean
    error: string | null
    truncated: boolean
  }>()

  const { t } = useI18n()
  const viewByPrefix = ref(VIEW_BY_ALL)
  const search = ref('')

  const prefixOptions = computed(() => computeMetricPrefixGroups(props.poolNames))

  watch(prefixOptions, (options) => {
    if (viewByPrefix.value === VIEW_BY_ALL) {
      return
    }
    if (!options.some((group) => group.value === viewByPrefix.value)) {
      viewByPrefix.value = VIEW_BY_ALL
    }
  })

  const filteredSortedNames = computed(() => {
    const prefix = viewByPrefix.value
    const filtered = props.poolNames.filter((name) => {
      if (prefix !== VIEW_BY_ALL && !matchesPrefix(name, prefix)) {
        return false
      }
      return matchesSearch(name, search.value)
    })
    return sortRelatedMetrics(filtered, props.metric)
  })

  const groups = computed((): MetricGroup[] => {
    if (!filteredSortedNames.value.length) {
      return []
    }
    return [
      {
        key: '__related__',
        label: '',
        names: filteredSortedNames.value,
      },
    ]
  })
</script>

<style scoped lang="less">
  .related-metrics-panel {
    display: flex;
    flex-direction: column;
    height: 100%;
    min-height: 0;
  }

  .related-metrics-controls {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 12px;
    flex-shrink: 0;
    padding: 8px 16px 12px;
    border-bottom: 1px solid var(--color-border-2);
  }

  .view-by {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .control-label {
    font-size: 13px;
    color: var(--color-text-2);
    white-space: nowrap;
  }

  .search {
    width: min(320px, 100%);
  }

  .related-metrics-list {
    flex: 1 1 0;
    min-height: 0;
    display: flex;
    flex-direction: column;
  }
</style>
