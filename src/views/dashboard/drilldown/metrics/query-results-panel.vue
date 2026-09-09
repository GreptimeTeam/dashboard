<template>
  <div class="query-results-panel">
    <a-alert v-if="error" type="error" show-icon :title="error" />
    <a-empty v-else-if="isEmpty" :description="emptyDescription" />
    <div v-else class="query-results-table">
      <DataTable
        :data="rows"
        :columns="tableColumns"
        :loading="loading"
        :show-context-menu="false"
        :enable-cell-expand="false"
        :pagination="false"
        :bordered="false"
        :show-header="true"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
  import { computed } from 'vue'
  import { useI18n } from 'vue-i18n'
  import DataTable from '@/components/data-table/index.vue'
  import type { CachedMainChart, MainChartPanelType } from '@/observability/use-metric-main-chart'
  import mapMainChartCachedToTableRows from '@/observability/metrics/main-chart-table'

  export type QueryResultsPanelResult = {
    cached: CachedMainChart | null
    loading: boolean
    error: string | null
    panelType: MainChartPanelType
    promqlQuery: string
  }

  const props = defineProps<{
    result: QueryResultsPanelResult | null
  }>()

  const { t } = useI18n()

  const loading = computed(() => props.result?.loading ?? false)
  const error = computed(() => props.result?.error ?? null)

  const rows = computed(() => {
    try {
      const mapped = mapMainChartCachedToTableRows(props.result?.cached)
      return Array.isArray(mapped) ? mapped : []
    } catch (err) {
      console.error('[QueryResultsPanel] failed to map main chart cache', err)
      return []
    }
  })

  const isEmpty = computed(() => !loading.value && !error.value && rows.value.length === 0)

  const tableColumns = computed(() => [
    { name: 'series', data_type: 'string', title: t('drilldown.queryResults.columnSeries') },
    { name: 'values', data_type: 'string', title: t('drilldown.queryResults.columnValues') },
  ])

  const emptyDescription = computed(() => t('drilldown.queryResults.emptyDescription'))
</script>

<style scoped lang="less">
  .query-results-panel {
    display: flex;
    flex-direction: column;
    height: 100%;
    min-height: 0;
    padding: 8px 0;
  }

  .query-results-table {
    flex: 1 1 0;
    min-height: 0;
  }
</style>
