<template lang="pug">
.metrics-sidebar
  h2.sidebar-title {{ t('drilldown.sidebar.title') }}
  .sidebar-db
    span.sidebar-section-label {{ t('dashboard.database') }}
    SignalDatabaseSelect.sidebar-db-select(v-model="metricsDatabase" size="small" block)

  .sidebar-section.sidebar-catalog
    span.sidebar-section-label {{ t('drilldown.sidebar.catalog') }}
    .sidebar-search
      a-input-search(
        v-model="searchModel"
        size="small"
        allow-clear
        :placeholder="t('drilldown.main.searchPlaceholder')"
      )
    MetricsCatalogControls(
      v-model:sort="sortModel"
      :loading="loading"
      :pool-count="poolCount"
      :filtered-count="filteredCount"
    )

  .sidebar-divider

  .sidebar-section.sidebar-name-filters
    span.sidebar-section-label {{ t('drilldown.sidebar.nameFilters') }}
    a-radio-group.filter-mode-switch(v-model="filterMode" type="button" size="small")
      a-radio(value="prefix")
        span.filter-mode-label {{ t('drilldown.sidebar.prefix') }}
        span.filter-mode-count(v-if="prefixModel.length") {{ prefixModel.length }}
      a-radio(value="suffix")
        span.filter-mode-label {{ t('drilldown.sidebar.suffix') }}
        span.filter-mode-count(v-if="suffixModel.length") {{ suffixModel.length }}

    .sidebar-tree
      PrefixFilterTree(
        v-if="filterMode === 'prefix'"
        :groups="prefixGroups"
        :metric-names="metricNames"
        :selected-prefixes="prefixModel"
        @update:selected-prefixes="updatePrefixes"
      )
      SuffixFilterTree(
        v-else
        :groups="suffixGroups"
        :selected-suffixes="suffixModel"
        @update:selected-suffixes="updateSuffixes"
      )
</template>

<script setup lang="ts">
  import { computed, ref } from 'vue'
  import { useI18n } from 'vue-i18n'
  import { useDrilldownContext } from '@/observability/context'
  import type { MetricsSortOption } from '@/observability/metrics/catalog'
  import type { PrefixGroup } from '@/observability/metrics/prefix-tree'
  import type { SuffixGroup } from '@/observability/metrics/suffix-tree'
  import SignalDatabaseSelect from '../components/signal-database-select.vue'
  import MetricsCatalogControls from './catalog-controls.vue'
  import PrefixFilterTree from './prefix-filter-tree.vue'
  import SuffixFilterTree from './suffix-filter-tree.vue'

  type CatalogFilterMode = 'prefix' | 'suffix'

  withDefaults(
    defineProps<{
      prefixGroups?: PrefixGroup[]
      suffixGroups?: SuffixGroup[]
      metricNames?: string[]
      loading?: boolean
      poolCount?: number
      filteredCount?: number
    }>(),
    {
      prefixGroups: () => [],
      suffixGroups: () => [],
      metricNames: () => [],
      loading: false,
      poolCount: 0,
      filteredCount: 0,
    }
  )

  const { t } = useI18n()
  const searchModel = defineModel<string>('search', { default: '' })
  const sortModel = defineModel<MetricsSortOption>('sort', { default: 'default' })
  const { sidebarFilters, setSidebarFilters, metricsDatabase } = useDrilldownContext()
  const filterMode = ref<CatalogFilterMode>('prefix')

  const updateSidebar = (patch: Partial<typeof sidebarFilters.value>) => {
    setSidebarFilters({
      ...sidebarFilters.value,
      ...patch,
    })
  }

  const prefixModel = computed(() => sidebarFilters.value.prefixes)
  const suffixModel = computed(() => sidebarFilters.value.suffixes)

  const updatePrefixes = (value: string[]) => {
    updateSidebar({ prefixes: value })
  }

  const updateSuffixes = (value: string[]) => {
    updateSidebar({ suffixes: value })
  }
</script>

<style scoped lang="less">
  .metrics-sidebar {
    display: flex;
    flex-direction: column;
    height: 100%;
    min-height: 0;
    padding: var(--gpt-gap-lg);
    overflow: hidden;
  }

  .sidebar-title {
    flex-shrink: 0;
    margin: 0 0 var(--gpt-gap-md);
    font-size: var(--gpt-font-md);
    font-weight: var(--gpt-font-weight-bold);
    line-height: 1.2;
    color: var(--gpt-text-primary);
  }

  .sidebar-db {
    flex-shrink: 0;
    margin-bottom: var(--gpt-gap-lg);
  }

  .sidebar-db-select {
    width: 100%;
  }

  .sidebar-section {
    display: flex;
    flex-direction: column;
    min-height: 0;
  }

  .sidebar-catalog {
    flex-shrink: 0;
  }

  .sidebar-name-filters {
    display: flex;
    flex: 1;
    flex-direction: column;
    min-height: 0;
  }

  .sidebar-divider {
    flex-shrink: 0;
    height: 1px;
    margin: var(--gpt-gap-lg) 0;
    background: var(--gpt-border-default);
  }

  .sidebar-search {
    flex-shrink: 0;
    margin-bottom: var(--gpt-gap-md);

    :deep(.arco-input-wrapper) {
      width: 100%;
    }
  }

  .sidebar-tree {
    display: flex;
    flex: 1;
    flex-direction: column;
    min-height: 0;
    overflow: hidden;
  }

  .sidebar-section-label {
    flex-shrink: 0;
    margin-bottom: var(--gpt-gap-md);
    font-size: var(--gpt-font-sm);
    line-height: 1;
    color: var(--gpt-text-secondary);
    white-space: nowrap;
  }

  .filter-mode-switch {
    display: flex;
    flex-shrink: 0;
    width: 100%;
    margin-bottom: var(--gpt-gap-lg);

    :deep(.arco-radio-button) {
      flex: 1;
      text-align: center;
    }

    :deep(.arco-radio-button-content) {
      display: inline-flex;
      gap: var(--gpt-gap-sm);
      align-items: center;
      justify-content: center;
    }

    :deep(.arco-radio-checked) .filter-mode-count {
      color: var(--gpt-main-dark);
      background: var(--gpt-text-inverse);
    }
  }

  .filter-mode-count {
    display: inline-flex;
    min-width: 16px;
    height: 16px;
    padding: 0 4px;
    font-size: var(--gpt-font-xs);
    font-weight: var(--gpt-font-weight-medium);
    line-height: 16px;
    color: var(--gpt-text-inverse);
    background: var(--gpt-main-purple);
    border-radius: var(--gpt-radius-md);
    justify-content: center;
  }
</style>
