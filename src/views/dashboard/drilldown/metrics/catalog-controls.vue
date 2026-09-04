<template lang="pug">
.metrics-catalog-controls
  span.catalog-count(v-if="loading") {{ t('drilldown.sidebar.loadingCount') }}
  span.catalog-count(v-else-if="showFilteredCount") {{ t('drilldown.sidebar.filteredCount', { filtered: filteredCount, total: poolCount }) }}
  span.catalog-count(v-else) {{ t('drilldown.sidebar.totalCount', { count: poolCount }) }}
  .sort-row
    span.sort-label {{ t('drilldown.main.sortLabel') }}
    a-select.sort-select(
      v-model="sortModel"
      size="mini"
      :bordered="false"
      :options="sortOptions"
      :trigger-props="{ autoFitPopupMinWidth: true }"
    )
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
    {
      label: t('drilldown.main.sortDefault'),
      value: 'default',
    },
    { label: t('drilldown.main.sortAsc'), value: 'asc' },
    { label: t('drilldown.main.sortDesc'), value: 'desc' },
  ])

  const showFilteredCount = computed(() => props.filteredCount !== props.poolCount)
</script>

<style scoped lang="less">
  .metrics-catalog-controls {
    display: flex;
    flex-direction: column;
    gap: var(--gpt-gap-sm);
    width: 100%;
  }

  .catalog-count {
    font-size: var(--gpt-font-sm);
    line-height: 1.4;
    color: var(--gpt-text-muted);
  }

  // Secondary control — not a full-width field twin of search.
  .sort-row {
    display: flex;
    align-items: center;
    justify-content: flex-start;
    gap: var(--gpt-gap-xs);
    min-width: 0;
  }

  .sort-label {
    flex-shrink: 0;
    font-size: var(--gpt-font-sm);
    line-height: 1;
    color: var(--gpt-text-muted);
  }

  .sort-select {
    flex: 0 1 auto;
    min-width: 0;
    max-width: 100%;

    :deep(.arco-select-view) {
      padding: 0 4px;
      background: transparent;
      border: none;
      box-shadow: none;
      color: var(--gpt-text-secondary);
      font-size: var(--gpt-font-sm);
    }

    :deep(.arco-select-view:hover),
    :deep(.arco-select-view-focus) {
      background: var(--color-fill-2);
    }

    :deep(.arco-select-view-value) {
      font-size: var(--gpt-font-sm);
    }
  }
</style>
