<template lang="pug">
.traces-breakdown-grid
  .breakdown-toolbar
    .breakdown-by-label
      span.drilldown-control-label {{ t('drilldown.traces.breakdownByAttr') }}
      a-select(
        v-model="groupByColumn"
        allow-search
        size="small"
        :style="{ width: '280px' }"
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
    mergeTracesFieldMapColumns,
    type TraceBreakdownAttribute,
  } from '@/observability/traces/field-map'
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
      if (!allAttrs.value.some((attr) => attr.column === groupByColumn.value)) {
        groupByColumn.value = preferDefaultColumn(allAttrs.value)
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

  .breakdown-by-label {
    display: flex;
    flex-direction: column;
    gap: var(--gpt-gap-xs);
  }

  .traces-breakdown-grid__values {
    padding-bottom: 0;
  }
</style>
