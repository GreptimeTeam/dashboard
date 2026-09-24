<template lang="pug">
.metrics-sidebar
  h2.sidebar-title {{ t('drilldown.sidebar.title') }}
  .gpt-table-sidebar-header
    .gpt-table-sidebar-header__label {{ t('dashboard.database') }}
    .gpt-table-sidebar-header__control
      SignalDatabaseSelect(v-model="metricsDatabase" size="mini" block)
    .gpt-table-sidebar-header__meta(:title="catalogCountLabel") {{ catalogCountLabel }}
    .gpt-table-sidebar-header__control
      a-input.search-input(
        v-model="searchModel"
        size="mini"
        allow-clear
        :placeholder="t('drilldown.main.searchPlaceholder')"
      )
        template(#suffix)
          svg.icon-11.icon-color
            use(href="#search")
  MetricsCatalogControls(v-model:sort="sortModel")

  .sidebar-name-filters
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

  const props = withDefaults(
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

  /** Header meta chip: loading / filtered / total, mirroring the table sidebar count. */
  const catalogCountLabel = computed(() => {
    if (props.loading) {
      return t('drilldown.sidebar.loadingCount')
    }
    if (props.filteredCount !== props.poolCount) {
      return t('drilldown.sidebar.filteredCount', {
        filtered: props.filteredCount,
        total: props.poolCount,
      })
    }
    return t('drilldown.sidebar.totalCount', { count: props.poolCount })
  })

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
  /* Full-bleed like table / metrics-query sidebars: no container padding — the
     gpt-table-sidebar-header brings its own inset + border, zones below re-inset. */
  .metrics-sidebar {
    display: flex;
    flex-direction: column;
    height: 100%;
    min-height: 0;
    overflow: hidden;
  }

  /* Narrower sidebar than the table one: slim label column keeps controls usable. */
  .metrics-sidebar .gpt-table-sidebar-header {
    --gpt-table-sidebar-label-col-width: 90px;
  }

  .sidebar-title {
    flex-shrink: 0;
    margin: 0;
    padding: var(--gpt-gap-md) 10px;
    font-size: var(--gpt-font-md);
    font-weight: var(--gpt-font-weight-bold);
    line-height: 1.2;
    color: var(--gpt-text-primary);
  }

  .sidebar-name-filters {
    display: flex;
    flex: 1;
    flex-direction: column;
    gap: var(--gpt-gap-md);
    min-height: 0;
    padding: var(--gpt-gap-md) 10px;
    overflow: hidden;
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
    font-size: var(--gpt-font-sm);
    line-height: 1;
    color: var(--gpt-text-muted);
    white-space: nowrap;
  }

  .filter-mode-switch {
    display: flex;
    flex-shrink: 0;
    width: 100%;

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
