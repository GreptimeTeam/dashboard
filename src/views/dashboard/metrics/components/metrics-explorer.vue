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
        @input="handleSearch"
        @clear="handleClear"
      )
        template(#prefix)
          icon-search
        template(#suffix)
          span.search-info {{ filteredMetrics.length }} metrics

    .metrics-list(v-if="filteredMetrics.length > 0")
      .metric-item(v-for="metric in filteredMetrics" :key="metric.name" @click="selectMetric(metric.name)")
        .metric-name(v-html="highlightMatch(metric.name, searchQuery)")
        .metric-description(v-if="metric.description") {{ metric.description }}

    .empty-state(v-else-if="searchQuery && !loading")
      a-empty(description="No metrics found")
        template(#image)
          icon-search

    .loading-state(v-else-if="loading")
      a-spin
        template(#icon)
          icon-loading(spin)
</template>

<script setup lang="ts">
  import { ref, computed, watch, onMounted } from 'vue'
  import { useDebounce } from '@vueuse/core'
  import { IconSearch, IconLoading } from '@arco-design/web-vue/es/icon'
  import { searchMetricNames, getMetricNames } from '@/api/metrics'

  const props = defineProps<{
    visible: boolean
  }>()

  const emit = defineEmits<{
    (e: 'update:visible', value: boolean): void
    (e: 'select', metricName: string): void
  }>()

  // Local state
  const searchQuery = ref('')
  const metrics = ref<any[]>([])
  const loading = ref(false)

  // Use VueUse's useDebounce for search query
  const debouncedSearchQuery = useDebounce(searchQuery, 300)

  // Computed property for local visible state
  const localVisible = computed({
    get: () => props.visible,
    set: (value: boolean) => emit('update:visible', value),
  })

  // Computed properties
  const filteredMetrics = computed(() => {
    return metrics.value
  })

  // Methods
  const fetchMetrics = async (query?: string) => {
    loading.value = true
    try {
      let response
      if (query && query.trim()) {
        // Search for specific metrics
        response = await searchMetricNames(query.trim())
      } else {
        // Fetch all available metrics
        response = await getMetricNames()
      }

      if (response && response.data) {
        metrics.value = response.data.map((metricName: string) => ({
          name: metricName,
          description: '', // Add description if available in your API
        }))
      } else {
        metrics.value = []
      }
    } catch (error) {
      console.error('Failed to fetch metrics:', error)
      metrics.value = []
    } finally {
      loading.value = false
    }
  }

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

  const handleSearch = () => {
    // Search is handled automatically by the debounced watcher
  }

  const handleClear = () => {
    searchQuery.value = ''
    fetchMetrics()
  }

  // Watch for debounced search query changes
  watch(debouncedSearchQuery, (newQuery) => {
    if (newQuery && newQuery.trim()) {
      fetchMetrics(newQuery.trim())
    } else {
      fetchMetrics()
    }
  })

  // Watch for visible changes to reset search and fetch default metrics
  watch(
    () => props.visible,
    (newVisible) => {
      if (newVisible) {
        // Fetch default metrics when modal opens
        fetchMetrics()
      } else {
        searchQuery.value = ''
        metrics.value = []
      }
    }
  )

  // Cleanup on unmount
  onMounted(() => {
    // No manual cleanup needed with useDebounce
  })
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
  }
</style>
