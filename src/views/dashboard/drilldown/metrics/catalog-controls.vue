<template lang="pug">
.metrics-catalog-controls
  a-select.sort-select(v-model="sortModel" size="small" :options="sortOptions")
  span.catalog-count(v-if="loading") {{ t('drilldown.sidebar.loadingCount') }}
  span.catalog-count(v-else-if="showFilteredCount") {{ t('drilldown.sidebar.filteredCount', { filtered: filteredCount, total: poolCount }) }}
  span.catalog-count(v-else) {{ t('drilldown.sidebar.totalCount', { count: poolCount }) }}
</template>

<script setup lang="ts">
  import { computed } from 'vue'
  import { useI18n } from 'vue-i18n'
  import type { MetricsSortOption } from '@/observability/metrics/catalog'

  const sortModel = defineModel<MetricsSortOption>('sort', { default: 'default' })

  const props = withDefaults(
    defineProps<{
      loading?: boolean
      poolCount?: number
      filteredCount?: number
    }>(),
    {
      loading: false,
      poolCount: 0,
      filteredCount: 0,
    }
  )

  const { t } = useI18n()

  const sortOptions = computed(() => [
    { label: t('drilldown.main.sortDefault'), value: 'default' },
    { label: t('drilldown.main.sortAsc'), value: 'asc' },
    { label: t('drilldown.main.sortDesc'), value: 'desc' },
  ])

  const showFilteredCount = computed(() => props.filteredCount !== props.poolCount)
</script>

<style scoped lang="less">
  .metrics-catalog-controls {
    display: flex;
    flex-direction: column;
    gap: 6px;
    width: 100%;
  }

  .sort-select {
    width: 100%;
  }

  .catalog-count {
    font-size: var(--gpt-font-sm);
    line-height: 1.4;
    color: var(--gpt-text-muted);
  }
</style>
