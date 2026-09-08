<template lang="pug">
.metric-detail-actions
  a-radio-group.variant-toggle(
    v-if="isHistogram"
    type="button"
    size="mini"
    :model-value="prefs.variant"
    @update:model-value="onVariantChange"
  )
    a-radio(value="heatmap") {{ t('drilldown.metricDetail.heatmap') }}
    a-radio(value="percentiles") {{ t('drilldown.metricDetail.percentiles') }}

  a-dropdown(
    v-if="!isHistogram"
    trigger="click"
    position="br"
    :popup-max-height="280"
  )
    a-button.configure-trigger(type="outline" size="mini")
      span.configure-label {{ currentConfigureLabel }}
      icon-down.configure-caret
    template(#content)
      a-doption(
        v-for="option in configureOptions"
        :key="option.key"
        :class="{ 'is-active': isConfigureActive(option) }"
        @click="onConfigureSelect(option)"
      ) {{ configureLabel(option.key) }}

  a-button(
    type="outline"
    size="mini"
    :disabled="!primaryPromql"
    @click="openInExplore"
  )
    | {{ t('drilldown.metricDetail.explore') }}
</template>

<script setup lang="ts">
  import { computed, ref, toRef, watch } from 'vue'
  import { useI18n } from 'vue-i18n'
  import { useRouter } from 'vue-router'
  import { IconDown } from '@arco-design/web-vue/es/icon'
  import { useDrilldownContext } from '@/observability/context'
  import { buildMetricsQueryLocation } from '@/observability/deep-links'
  import { filtersForPromMatch } from '@/observability/filters'
  import { inferMetricKind, type MetricKind } from '@/observability/metrics/infer-promql'
  import useMainChartPrefs, {
    configureOptionsForKind,
    type TimeseriesAgg,
  } from '@/observability/metrics/main-chart-config'
  import buildMainChartQueries from '@/observability/metrics/main-chart-queries'
  import resolveMetricKind from '@/observability/resolve-metric-kind'

  const props = defineProps<{
    metric: string
  }>()

  const { t } = useI18n()
  const router = useRouter()
  const ctx = useDrilldownContext()
  const metricName = toRef(props, 'metric')
  const { prefs, setAgg, setVariant } = useMainChartPrefs(metricName)

  const kind = ref<MetricKind>(inferMetricKind(props.metric))
  watch(
    () => props.metric,
    async (name) => {
      kind.value = await resolveMetricKind(name)
    },
    { immediate: true }
  )
  const isHistogram = computed(() => kind.value === 'histogram')
  const configureOptions = computed(() => configureOptionsForKind(kind.value))

  const configureLabel = (key: string) => {
    const map: Record<string, string> = {
      avg: t('drilldown.metricDetail.configAvg'),
      sum: t('drilldown.metricDetail.configSum'),
      min_max: t('drilldown.metricDetail.configMinMax'),
    }
    return map[key] ?? key
  }

  const currentConfigureLabel = computed(() => configureLabel(prefs.value.agg))

  const primaryPromql = computed(() => {
    const name = props.metric.trim()
    if (!name) {
      return ''
    }
    const matchers = filtersForPromMatch(ctx.filters.value)
    const parts = Object.entries(matchers).map(
      ([key, value]) => `${key}="${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
    )
    const matcherStr = parts.length ? parts.join(',') : undefined
    return buildMainChartQueries(name, matcherStr, prefs.value, kind.value).queries[0]?.expr ?? ''
  })

  const isConfigureActive = (option: { key: string; agg?: TimeseriesAgg }) => {
    return prefs.value.agg === option.agg && prefs.value.variant === 'timeseries'
  }

  const onConfigureSelect = (option: { key: string; agg?: TimeseriesAgg }) => {
    if (option.agg) {
      setAgg(option.agg)
    }
  }

  const onVariantChange = (value: string | number | boolean) => {
    if (value === 'heatmap' || value === 'percentiles') {
      setVariant(value)
    }
  }

  const openInExplore = () => {
    const promql = primaryPromql.value
    if (!promql) {
      return
    }
    const location = buildMetricsQueryLocation({
      promql,
      timeLength: ctx.time.value,
      rangeTime: ctx.time.value === 0 ? [...ctx.rangeTime.value] : undefined,
    })
    router.push(location)
  }
</script>

<style scoped lang="less">
  .metric-detail-actions {
    display: flex;
    flex-shrink: 0;
    flex-wrap: nowrap;
    align-items: center;
    justify-content: flex-end;
    gap: 8px;
    margin-left: auto;
    padding-left: 12px;
  }

  .configure-trigger {
    display: inline-flex;
    align-items: center;
    gap: 4px;
  }

  .configure-label {
    line-height: 1;
  }

  .configure-caret {
    flex-shrink: 0;
    font-size: 12px;
  }

  :deep(.arco-dropdown-option.is-active) {
    color: rgb(var(--primary-6));
    font-weight: 600;
  }
</style>
