<template lang="pug">
.traces-breakdown-grid
  .breakdown-toolbar
    .breakdown-scope
      span.toolbar-label {{ t('drilldown.traces.breakdownScope') }}
      a-radio-group(v-model="scope" type="button" size="small")
        a-radio(value="all") {{ t('drilldown.traces.breakdownScopeAll') }}
        a-radio(value="resource") {{ t('drilldown.traces.breakdownScopeResource') }}
        a-radio(value="span") {{ t('drilldown.traces.breakdownScopeSpan') }}
    .breakdown-by-label
      span.toolbar-label {{ t('drilldown.traces.breakdownByAttr') }}
      a-select(
        v-model="groupByColumn"
        allow-search
        size="small"
        :style="{ width: '280px' }"
        :placeholder="t('drilldown.traces.breakdownByAttrPlaceholder')"
        :loading="loadingAttrs"
      )
        a-option(v-for="attr in scopedAttrs" :key="attr.column" :value="attr.column") {{ attr.label }}

  a-spin(style="width: 100%" :loading="loading")
    .breakdown-values-grid
      BreakdownValueCard(
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
  import { computed, onMounted, ref, watch, type MaybeRefOrGetter } from 'vue'
  import { useI18n } from 'vue-i18n'
  import editorApi from '@/api/editor'
  import { useDrilldownContext } from '@/observability/context'
  import {
    fetchBreakdownAttrValues,
    fetchBreakdownSeries,
    type BreakdownAttrValue,
    type RedMetric,
  } from '@/observability/adapters/traces'
  import {
    discoverTraceBreakdownAttributes,
    filterBreakdownAttributesByScope,
    mergeTracesFieldMapColumns,
    type TraceAttrScope,
    type TraceBreakdownAttribute,
  } from '@/observability/traces/field-map'
  import BreakdownValueCard from './breakdown-value-card.vue'

  type ScopeFilter = TraceAttrScope | 'all'

  const props = defineProps<{
    redMetric: RedMetric
    scrollRoot?: MaybeRefOrGetter<HTMLElement | null | undefined>
  }>()

  const { t } = useI18n()
  const ctx = useDrilldownContext()

  const scope = ref<ScopeFilter>('all')
  const allAttrs = ref<TraceBreakdownAttribute[]>([])
  const groupByColumn = ref('service_name')
  const loadingAttrs = ref(false)
  const loading = ref(false)
  const values = ref<BreakdownAttrValue[]>([])
  const seriesByValue = ref<Record<string, Array<[number, number]>>>({})
  const yAxis = ref({ yMin: 0, yMax: 1 })

  const scopedAttrs = computed(() => filterBreakdownAttributesByScope(allAttrs.value, scope.value))

  const preferDefaultColumn = (attrs: TraceBreakdownAttribute[]): string => {
    const service = attrs.find((attr) => attr.column === 'service_name')
    if (service) {
      return service.column
    }
    return attrs[0]?.column || 'service_name'
  }

  const syncFieldMap = (attrs: TraceBreakdownAttribute[]) => {
    const columns = attrs.map((attr) => attr.column)
    const prev = ctx.fieldMap.value.traces
    const next = mergeTracesFieldMapColumns(prev, columns)
    if (Object.keys(next).length !== Object.keys(prev).length) {
      ctx.fieldMap.value = {
        ...ctx.fieldMap.value,
        traces: next,
      }
    }
  }

  const loadAttributes = async () => {
    if (ctx.focusTraceId.value) {
      return
    }
    const tableName = ctx.tracesTable.value
    if (!tableName) {
      allAttrs.value = []
      return
    }
    loadingAttrs.value = true
    try {
      const columns = await editorApi.getTableSchema(tableName)
      allAttrs.value = discoverTraceBreakdownAttributes(columns || [])
      syncFieldMap(allAttrs.value)
      const available = filterBreakdownAttributesByScope(allAttrs.value, scope.value)
      if (!available.some((attr) => attr.column === groupByColumn.value)) {
        groupByColumn.value = preferDefaultColumn(available.length ? available : allAttrs.value)
      }
    } catch (error) {
      console.error('Failed to load traces breakdown attributes:', error)
      allAttrs.value = []
    } finally {
      loadingAttrs.value = false
    }
  }

  const loadValues = async () => {
    if (ctx.focusTraceId.value) {
      return
    }
    if (!ctx.tracesTable.value || !groupByColumn.value) {
      values.value = []
      seriesByValue.value = {}
      yAxis.value = { yMin: 0, yMax: 1 }
      return
    }
    loading.value = true
    try {
      const nextValues = await fetchBreakdownAttrValues(ctx, props.redMetric, groupByColumn.value)
      const series = await fetchBreakdownSeries(
        ctx,
        props.redMetric,
        groupByColumn.value,
        nextValues.map((item) => item.value)
      )
      values.value = nextValues
      seriesByValue.value = series.series
      yAxis.value = series.yAxis
    } finally {
      loading.value = false
    }
  }

  onMounted(async () => {
    await loadAttributes()
    await loadValues()
  })

  watch(scope, () => {
    const available = scopedAttrs.value
    if (!available.some((attr) => attr.column === groupByColumn.value)) {
      groupByColumn.value = preferDefaultColumn(available)
    }
  })

  watch(
    () => ctx.tracesTable.value,
    async () => {
      if (ctx.focusTraceId.value) {
        return
      }
      await loadAttributes()
      await loadValues()
    }
  )

  watch(
    () => [
      props.redMetric,
      groupByColumn.value,
      ctx.filters.value,
      ctx.time.value,
      ctx.rangeTime.value[0],
      ctx.rangeTime.value[1],
      ctx.refreshKey.value,
      ctx.focusTraceId.value,
    ],
    () => {
      if (ctx.focusTraceId.value) {
        return
      }
      loadValues()
    },
    { deep: true }
  )
</script>

<style scoped lang="less">
  .traces-breakdown-grid {
    padding: 0 0 var(--gpt-page-padding-x);
  }

  .breakdown-toolbar {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-end;
    gap: var(--gpt-gap-xl);
    padding: var(--gpt-gap-lg) var(--gpt-page-padding-x) 0;
  }

  .breakdown-scope,
  .breakdown-by-label {
    display: flex;
    flex-direction: column;
    gap: var(--gpt-gap-xs);
  }

  .toolbar-label {
    font-size: var(--gpt-font-base);
    font-weight: var(--gpt-font-weight-medium);
    color: var(--color-text-2);
  }

  .breakdown-values-grid {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: var(--gpt-gap-md);
    padding: var(--gpt-gap-lg) var(--gpt-page-padding-x);
  }

  @media (max-width: 1400px) {
    .breakdown-values-grid {
      grid-template-columns: repeat(3, minmax(0, 1fr));
    }
  }

  @media (max-width: 1024px) {
    .breakdown-values-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }

  @media (max-width: 640px) {
    .breakdown-values-grid {
      grid-template-columns: 1fr;
    }
  }
</style>
