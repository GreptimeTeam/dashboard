<template lang="pug">
.metrics-sidebar
  h2.sidebar-title {{ t('drilldown.sidebar.title') }}

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
      a-radio(value="prefix") {{ t('drilldown.sidebar.prefix') }}
      a-radio(value="suffix") {{ t('drilldown.sidebar.suffix') }}

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
  const { sidebarFilters, setSidebarFilters } = useDrilldownContext()
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
    padding: 12px;
    overflow: hidden;
  }

  .sidebar-title {
    flex-shrink: 0;
    margin: 0 0 12px;
    font-size: var(--gpt-font-md);
    font-weight: 700;
    line-height: 1.2;
    color: var(--gpt-text-primary);
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
    margin: 12px 0;
    background: var(--gpt-border-default);
  }

  .sidebar-search {
    flex-shrink: 0;
    margin-bottom: 8px;

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
    margin-bottom: 8px;
    font-size: var(--gpt-font-sm);
    line-height: 1;
    color: var(--gpt-text-secondary);
    white-space: nowrap;
  }

  .filter-mode-switch {
    display: flex;
    flex-shrink: 0;
    width: 100%;
    margin-bottom: 12px;

    :deep(.arco-radio-button) {
      flex: 1;
      text-align: center;
    }
  }
</style>
