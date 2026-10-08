<template lang="pug">
.traces-breakdown-grid
  .breakdown-toolbar
    span.drilldown-toolbar__group
      span.drilldown-toolbar__label {{ t('drilldown.traces.breakdownByAttr') }}
      a-select.drilldown-filter-select(
        v-model="groupByColumn"
        allow-search
        size="small"
        :placeholder="t('drilldown.traces.breakdownByAttrPlaceholder')"
        :loading="loadingAttrs"
      )
        a-optgroup(:label="t('drilldown.traces.breakdownAttrGroupResource')")
          a-option(v-for="attr in resourceAttrs" :key="attr.column" :value="attr.column") {{ attr.label }}
        a-optgroup(:label="t('drilldown.traces.breakdownAttrGroupSpan')")
          a-option(v-for="attr in spanAttrs" :key="attr.column" :value="attr.column") {{ attr.label }}

  a-spin(style="width: 100%" :loading="loading")
    .drilldown-grid.traces-breakdown-grid__values
      TracesBreakdownPanel(
        v-for="(item, index) in values"
        :key="`${groupByColumn}:${item.value}`"
        :red-metric="redMetric"
        :attr-key="groupByColumn"
        :attr-value="item.value"
        :points="seriesByValue[item.value] || []"
        :y-min="yAxis.yMin"
        :y-max="yAxis.yMax"
        :color-index="index"
        :scroll-root="scrollRoot"
      )
    a-empty(v-if="!values.length && !loading" :description="t('drilldown.traces.breakdownNoValues')")
</template>

<script setup lang="ts">
  import { computed, ref, watch, type MaybeRefOrGetter } from 'vue'
  import { useI18n } from 'vue-i18n'
  import useTableSchemaStore from '@/store/modules/table-schema'
  import { useDrilldownContext } from '@/observability/context'
  import {
    fetchBreakdownAttrValues,
    fetchBreakdownSeries,
    type BreakdownAttrValue,
    type RedMetric,
  } from '@/observability/adapters/traces'
  import { discoverTraceBreakdownAttributes, type TraceBreakdownAttribute } from '@/observability/traces/field-map'
  import useSignalQuery from '@/observability/use-signal-query'
  import TracesBreakdownPanel from './traces-breakdown-panel.vue'

  const props = defineProps<{
    redMetric: RedMetric
    scrollRoot?: MaybeRefOrGetter<HTMLElement | null | undefined>
  }>()

  const { t } = useI18n()
  const ctx = useDrilldownContext()

  const allAttrs = ref<TraceBreakdownAttribute[]>([])
  const groupByColumn = ref('service_name')
  const loadingAttrs = ref(false)
  const loading = ref(false)
  const values = ref<BreakdownAttrValue[]>([])
  const seriesByValue = ref<Record<string, Array<[number, number]>>>({})
  const yAxis = ref({ yMin: 0, yMax: 1 })

  const resourceAttrs = computed(() => allAttrs.value.filter((attr) => attr.scope === 'resource'))
  const spanAttrs = computed(() => allAttrs.value.filter((attr) => attr.scope === 'span'))

  const preferDefaultColumn = (attrs: TraceBreakdownAttribute[]): string => {
    const service = attrs.find((attr) => attr.column === 'service_name')
    if (service) {
      return service.column
    }
    return attrs[0]?.column || 'service_name'
  }

  let attrsRequestId = 0

  const loadAttributes = async (): Promise<void> => {
    if (ctx.ui.focusTraceId.value) {
      return
    }
    const tableName = ctx.semantics.traces.table.value
    if (!tableName) {
      allAttrs.value = []
      return
    }
    attrsRequestId += 1
    const requestId = attrsRequestId
    loadingAttrs.value = true
    try {
      // Session-cached store read — the bind path already fetched these columns once.
      const columns = await useTableSchemaStore().ensureTableSchema(tableName, ctx.connection.databaseFor('traces'))
      if (requestId !== attrsRequestId) {
        return
      }
      allAttrs.value = discoverTraceBreakdownAttributes(columns || [])
      if (!allAttrs.value.some((attr) => attr.column === groupByColumn.value)) {
        groupByColumn.value = preferDefaultColumn(allAttrs.value)
      }
    } catch (error) {
      console.error('Failed to load traces breakdown attributes:', error)
      if (requestId === attrsRequestId) {
        allAttrs.value = []
      }
    } finally {
      if (requestId === attrsRequestId) {
        loadingAttrs.value = false
      }
    }
  }

  /**
   * Value pipeline: useSignalQuery owns when values load. Signature dedupe skips
   * readiness flaps; refreshKey is part of the shared signature (manual refresh
   * always re-fetches); rapid parameter changes drop stale responses.
   */
  let valuesRequestId = 0

  const loadValues = async (): Promise<void> => {
    if (ctx.ui.focusTraceId.value) {
      return
    }
    if (!ctx.semantics.traces.table.value || !groupByColumn.value) {
      values.value = []
      seriesByValue.value = {}
      yAxis.value = { yMin: 0, yMax: 1 }
      return
    }
    valuesRequestId += 1
    const requestId = valuesRequestId
    loading.value = true
    try {
      const nextValues = await fetchBreakdownAttrValues(ctx, props.redMetric, groupByColumn.value)
      const series = await fetchBreakdownSeries(
        ctx,
        props.redMetric,
        groupByColumn.value,
        nextValues.map((item) => item.value)
      )
      if (requestId !== valuesRequestId) {
        return
      }
      values.value = nextValues
      seriesByValue.value = series.series
      yAxis.value = series.yAxis
    } finally {
      if (requestId === valuesRequestId) {
        loading.value = false
      }
    }
  }

  // Attribute discovery: follow bind revision (table/columns), not query time/filters.
  watch(
    () => [ctx.ui.focusTraceId.value, ctx.semantics.traces.revision.value] as const,
    () => {
      loadAttributes()
    },
    { immediate: true }
  )

  useSignalQuery(ctx, 'traces', {
    enabled: () => !ctx.ui.focusTraceId.value && Boolean(groupByColumn.value),
    params: () => ({ redMetric: props.redMetric, groupBy: groupByColumn.value }),
    run: () => loadValues(),
  })
</script>

<style scoped lang="less">
  .traces-breakdown-grid {
    padding: 0 0 var(--gpt-page-padding-x);
  }

  .breakdown-toolbar {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--gpt-gap-xl);
    padding: var(--gpt-gap-lg) var(--gpt-page-padding-x) 0;
  }

  .traces-breakdown-grid__values {
    padding-bottom: 0;
  }
</style>
