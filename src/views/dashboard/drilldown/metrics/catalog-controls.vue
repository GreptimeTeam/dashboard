<template lang="pug">
.metrics-catalog-sort
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

  const { t } = useI18n()

  const sortOptions = computed(() => [
    {
      label: t('drilldown.main.sortDefault'),
      value: 'default',
    },
    { label: t('drilldown.main.sortAsc'), value: 'asc' },
    { label: t('drilldown.main.sortDesc'), value: 'desc' },
  ])
</script>

<style scoped lang="less">
  /* Sits right under the sidebar header; its border-bottom replaces the old divider. */
  .metrics-catalog-sort {
    display: flex;
    flex-shrink: 0;
    align-items: center;
    gap: var(--gpt-gap-xs);
    padding: var(--gpt-gap-sm) 10px;
    border-bottom: 1px solid var(--gpt-border-default);
  }

  .sort-label {
    flex-shrink: 0;
    font-size: var(--gpt-font-sm);
    line-height: 1;
    color: var(--gpt-text-muted);
  }

  // Secondary control — not a full-width field twin of search.
  .sort-select {
    flex: 0 1 auto;
    min-width: 0;
    max-width: 100%;

    :deep(.arco-select-view) {
      padding: 0 var(--gpt-gap-xs);
      background: transparent;
      border: none;
      box-shadow: none;
      color: var(--gpt-text-secondary);
      font-size: var(--gpt-font-sm);
    }

    :deep(.arco-select-view:hover),
    :deep(.arco-select-view-focus) {
      background: var(--gpt-nav-active-bg);
    }

    :deep(.arco-select-view-value) {
      font-size: var(--gpt-font-sm);
    }
  }
</style>
