<template lang="pug">
.breakdown-mini-chart(ref="targetRef")
  a-spin.panel-loading(v-if="loading" :loading="true")
  .panel-state.panel-error(v-else-if="error") {{ t('drilldown.main.sparklineError') }}
  .panel-state(v-else-if="isEmpty") {{ t('drilldown.main.sparklineNoData') }}
  .panel-chart(v-else-if="showChart")
    Chart(:key="chartRenderKey" :height="chartHeight" :options="chartOption")
</template>

<script setup lang="ts">
  import { computed, toRef, type Ref } from 'vue'
  import { useI18n } from 'vue-i18n'
  import Chart from '@/components/raw-chart/index.vue'
  import { useDrilldownContext } from '@/observability/context'
  import { BREAKDOWN_CHART_HEIGHT } from '@/observability/metrics/panel-stats'
  import useBreakdownSparkline, { type BreakdownSparklineMode } from '@/observability/use-breakdown-sparkline'
  import useLazyPanelQuery from '@/observability/use-lazy-panel-query'

  const props = defineProps<{
    metric: string
    labelKey: string
    mode: BreakdownSparklineMode
    value?: string
    scrollRoot: Ref<HTMLElement | null | undefined>
  }>()

  const { t } = useI18n()
  const ctx = useDrilldownContext()
  const metric = toRef(props, 'metric')
  const labelKey = toRef(props, 'labelKey')
  const mode = toRef(props, 'mode')
  const value = toRef(props, 'value')
  const { targetRef, hasBeenVisible } = useLazyPanelQuery(props.scrollRoot)

  const { loading, error, chartOption, promqlQuery, isEmpty } = useBreakdownSparkline(ctx, {
    metric,
    labelKey,
    mode,
    value,
    enabled: hasBeenVisible,
  })

  const chartHeight = `${BREAKDOWN_CHART_HEIGHT}px`
  const showChart = computed(() => Boolean(chartOption.value) && !loading.value && !error.value)
  const chartRenderKey = computed(
    () => `${props.metric}:${props.labelKey}:${props.mode}:${props.value ?? ''}:${promqlQuery.value}`
  )
</script>

<style scoped lang="less">
  .breakdown-mini-chart {
    display: flex;
    flex-direction: column;
    min-height: 112px;
  }

  .panel-loading,
  .panel-state {
    display: flex;
    flex: 1;
    align-items: center;
    justify-content: center;
    min-height: 112px;
  }

  .panel-state {
    border: 1px dashed var(--color-border-2);
    border-radius: 6px;
    font-size: 12px;
    color: var(--color-text-3);
  }

  .panel-error {
    color: rgb(var(--danger-6));
  }

  .panel-chart {
    flex-shrink: 0;
    overflow: hidden;
    border-radius: 6px;
    background: var(--gpt-bg-panel);
  }
</style>
