<template lang="pug">
.metrics-sidebar
  .sidebar-section
    span.sidebar-section-label {{ t('drilldown.sidebar.filters') }}
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
  import type { PrefixGroup } from '@/observability/metrics/prefix-tree'
  import type { SuffixGroup } from '@/observability/metrics/suffix-tree'
  import PrefixFilterTree from './prefix-filter-tree.vue'
  import SuffixFilterTree from './suffix-filter-tree.vue'

  type CatalogFilterMode = 'prefix' | 'suffix'

  withDefaults(
    defineProps<{
      prefixGroups?: PrefixGroup[]
      suffixGroups?: SuffixGroup[]
      metricNames?: string[]
    }>(),
    {
      prefixGroups: () => [],
      suffixGroups: () => [],
      metricNames: () => [],
    }
  )

  const { t } = useI18n()
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
    background: var(--color-bg-2);
  }

  .sidebar-section {
    display: flex;
    flex: 1;
    flex-direction: column;
    min-height: 0;
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
    font-size: 12px;
    line-height: 1;
    color: var(--color-text-2);
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
