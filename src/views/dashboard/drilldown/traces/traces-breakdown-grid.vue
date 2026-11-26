<template lang="pug">
.traces-breakdown-grid
  .breakdown-toolbar
    span.drilldown-toolbar__group
      span.drilldown-toolbar__label {{ t('drilldown.traces.breakdownByAttr') }}
      a-select.drilldown-filter-select.drilldown-filter-select--multi(
        v-model="groupByColumns"
        multiple
        allow-search
        size="small"
        :max-tag-count="2"
        :placeholder="t('drilldown.traces.breakdownByAttrPlaceholder')"
        :loading="loadingAttrs"
      )
        a-optgroup(label="Resource")
          a-option(v-for="attr in resourceAttrs" :key="attr.column" :value="attr.column") {{ attr.label }}
        a-optgroup(label="Span")
          a-option(v-for="attr in spanAttrs" :key="attr.column" :value="attr.column") {{ attr.label }}
    p.traces-breakdown-grid__truncated.gpt-text-toolbar-meta(v-if="truncated && !loading") {{ t('drilldown.traces.breakdownTruncated', { count: BREAKDOWN_CARD_LIMIT }) }}
  a-spin(style="width: 100%" :loading="loading")
    .drilldown-grid.traces-breakdown-grid__values
      TracesBreakdownPanel(
        v-for="(item, index) in values"
        :key="`${groupByColumns.join('\u001f')}:${item.value}`"
        :red-metric="redMetric"
        :group-columns="groupByColumns"
        :group-values="item.parts"
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
    fetchTraceAttributeKeys,
    type BreakdownAttrValue,
    type RedMetric,
  } from '@/observability/adapters/traces'
  import { discoverTraceBreakdownAttributes, type TraceBreakdownAttribute } from '@/observability/traces/field-map'
  import { BREAKDOWN_CARD_LIMIT } from '@/observability/traces/red-queries'
  import useSignalQuery from '@/observability/use-signal-query'
  import TracesBreakdownPanel from './traces-breakdown-panel.vue'

  const props = defineProps<{
    redMetric: RedMetric
    scrollRoot?: MaybeRefOrGetter<HTMLElement | null | undefined>
  }>()

  const { t } = useI18n()
  const ctx = useDrilldownContext()

  const allAttrs = ref<TraceBreakdownAttribute[]>([])
  const groupByColumns = ref<string[]>(['service_name'])
  const loadingAttrs = ref(false)
  const loading = ref(false)
  const values = ref<BreakdownAttrValue[]>([])
  const truncated = ref(false)
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
      // v2 keeps attributes in JSON2 containers: sample their keys so the dropdown still
      // offers attribute dimensions (v1 reads them straight from the column list).
      const sampled = await fetchTraceAttributeKeys(
        ctx,
        (columns || []).map((column) => column.name)
      )
      allAttrs.value = discoverTraceBreakdownAttributes(columns || [], sampled)
      const known = new Set(allAttrs.value.map((attr) => attr.column))
      const kept = groupByColumns.value.filter((column) => known.has(column))
      if (!kept.length) {
        groupByColumns.value = [preferDefaultColumn(allAttrs.value)]
      } else if (kept.length !== groupByColumns.value.length) {
        groupByColumns.value = kept
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
    if (!ctx.semantics.traces.table.value || !groupByColumns.value.length) {
      values.value = []
      truncated.value = false
      seriesByValue.value = {}
      yAxis.value = { yMin: 0, yMax: 1 }
      return
    }
    valuesRequestId += 1
    const requestId = valuesRequestId
    loading.value = true
    try {
      const result = await fetchBreakdownAttrValues(ctx, props.redMetric, groupByColumns.value)
      const series = await fetchBreakdownSeries(ctx, props.redMetric, groupByColumns.value, result.values)
      if (requestId !== valuesRequestId) {
        return
      }
      values.value = result.values
      truncated.value = result.truncated
      seriesByValue.value = series.series
      yAxis.value = series.yAxis
    } finally {
      if (requestId === valuesRequestId) {
        loading.value = false
      }
    }
  }

  // Clearing the last tag would leave the breakdown with nothing to group on.
  watch(groupByColumns, (columns) => {
    if (!columns.length) {
      groupByColumns.value = [preferDefaultColumn(allAttrs.value)]
    }
  })

  // Attribute discovery: follow bind revision (table/columns) and span scope (all-spans sampling
  // also sees child-span attributes), not query time/filters.
  watch(
    () => [ctx.ui.focusTraceId.value, ctx.semantics.traces.revision.value, ctx.ui.spanScope.value] as const,
    () => {
      loadAttributes()
    },
    { immediate: true }
  )

  useSignalQuery(ctx, 'traces', {
    enabled: () => !ctx.ui.focusTraceId.value && groupByColumns.value.length > 0,
    params: () => ({ redMetric: props.redMetric, groupBy: groupByColumns.value, spanScope: ctx.ui.spanScope.value }),
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

  .traces-breakdown-grid__truncated {
    margin: 0;
    align-self: center;
  }
</style>
