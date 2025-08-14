<template lang="pug">
a-modal(
  v-model:visible="localVisible"
  title="Metrics Explorer"
  :width="800"
  :footer="false"
  :mask-closable="false"
)
  .metrics-explorer
    .search-section
      a-input(
        v-model="searchQuery"
        placeholder="Search metrics with fuzzy matching..."
        size="large"
        allow-clear
      )
        template(#prefix)
          icon-search
        template(#suffix)
          span.search-info {{ filteredMetrics.length }} metrics

    .metrics-list(v-if="filteredMetrics.length > 0")
      .metric-item(v-for="metric in filteredMetrics" :key="metric.name" @click="selectMetric(metric.name)")
        .metric-name(v-html="highlightMatch(metric.name, searchQuery)")
        .metric-description(v-if="metric.description") {{ metric.description }}

    .empty-state(v-else-if="searchQuery")
      a-empty(description="No metrics found")
        template(#image)
          icon-search

    .loading-state(v-else-if="loading")
      a-spin(size="large")
        template(#icon)
          icon-loading(spin)

    .initial-state(v-else)
      .browse-hint
        h3 Browse and filter all metrics and metadata with a fuzzy search
        p Start typing to search for metrics, or browse through the list below
      .popular-metrics(v-if="popularMetrics.length > 0")
        h4 Popular Metrics
        .metric-tags
          a-tag(
            v-for="metric in popularMetrics"
            :key="metric"
            style="cursor: pointer; margin: 4px"
            @click="selectMetric(metric)"
          ) {{ metric }}
</template>

<script setup lang="ts">
  import { ref, computed, watch } from 'vue'
  import { IconSearch, IconLoading } from '@arco-design/web-vue/es/icon'

  const props = defineProps<{
    visible: boolean
    metrics: any[]
    loading: boolean
  }>()

  const emit = defineEmits<{
    (e: 'update:visible', value: boolean): void
    (e: 'select', metricName: string): void
  }>()

  // Local state
  const searchQuery = ref('')

  // Computed property for local visible state
  const localVisible = computed({
    get: () => props.visible,
    set: (value: boolean) => emit('update:visible', value),
  })

  // Computed properties
  const filteredMetrics = computed(() => {
    if (!searchQuery.value) return props.metrics

    const query = searchQuery.value.toLowerCase()
    return props.metrics.filter((metric) => metric.name.toLowerCase().includes(query))
  })

  const popularMetrics = computed(() => {
    // Return some common metrics for quick access
    return ['go_goroutines', 'go_memstats_alloc_bytes', 'prometheus_http_requests_total', 'prometheus_build_info']
  })

  // Methods
  const selectMetric = (metricName: string) => {
    emit('select', metricName)
    emit('update:visible', false)
    searchQuery.value = '' // Reset search when closing
  }

  const highlightMatch = (text: string, query: string): string => {
    if (!query) return text
    const regex = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi')
    return text.replace(regex, '<span class="highlight">$1</span>')
  }

  // Watch for visible changes to reset search
  watch(
    () => props.visible,
    (newVisible) => {
      if (!newVisible) {
        searchQuery.value = ''
      }
    }
  )
</script>

<style lang="less" scoped>
  .metrics-explorer {
    .search-section {
      margin-bottom: 20px;

      .search-info {
        color: var(--color-text-secondary);
        font-size: 12px;
      }
    }

    .metrics-list {
      max-height: 400px;
      overflow-y: auto;

      .metric-item {
        padding: 12px;
        border: 1px solid var(--color-border-light);
        border-radius: 6px;
        margin-bottom: 8px;
        cursor: pointer;
        transition: all 0.2s;

        &:hover {
          background: var(--color-fill-2);
          border-color: var(--color-primary-light-1);
        }

        .metric-name {
          font-weight: 500;
          color: var(--color-text-primary);
          margin-bottom: 4px;

          .highlight {
            background: var(--color-warning-light-1);
            color: var(--color-warning);
            padding: 2px 4px;
            border-radius: 3px;
            font-weight: 600;
          }
        }

        .metric-description {
          font-size: 12px;
          color: var(--color-text-secondary);
        }
      }
    }

    .browse-hint {
      text-align: center;
      padding: 40px 20px;
      color: var(--color-text-secondary);

      h3 {
        margin-bottom: 8px;
        color: var(--color-text-primary);
      }

      p {
        margin: 0;
      }
    }

    .popular-metrics {
      padding: 20px;

      h4 {
        margin-bottom: 12px;
        color: var(--color-text-primary);
      }

      .metric-tags {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
      }
    }
  }
</style>
