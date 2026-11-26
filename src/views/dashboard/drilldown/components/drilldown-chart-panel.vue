<template lang="pug">
.drilldown-chart-panel(ref="rootRef")
  a-spin.drilldown-chart-panel__loading(v-if="showLoading" :loading="true")
  .drilldown-chart-panel__state.drilldown-chart-panel__state--error(v-else-if="showError") {{ error }}
  .drilldown-chart-panel__state(v-else-if="unsupportedMessage") {{ unsupportedMessage }}
  .drilldown-chart-panel__state(v-else-if="emptyMessage") {{ emptyMessage }}
  .drilldown-chart-panel__chart(
    v-else-if="canRender"
    ref="plotRef"
    :title="chartTitle"
    :class="chartClass"
  )
    Chart(
      :key="resolvedRenderKey"
      time-interaction
      :height="heightStyle"
      :options="option"
      :brush-select="false"
      :time-window-ms="timeWindowMs"
      @time-range-change="onTimeRangeChange"
    )
    .drilldown-chart-panel__mask(v-if="loading")
      a-spin(:loading="true")
    slot(name="aside")
  .drilldown-chart-panel__footer(v-if="canRender && hasFooter")
    slot(name="footer")
</template>

<script setup lang="ts">
  import { computed, ref, useSlots } from 'vue'
  import type { EChartsOption } from 'echarts'
  import Chart from '@/components/raw-chart/index.vue'
  import { useDrilldownContext } from '@/observability/context'
  import useDrilldownChartTime from '@/observability/use-drilldown-chart-time'

  const props = withDefaults(
    defineProps<{
      option: EChartsOption | null
      height: number | string
      loading?: boolean
      error?: string | null
      emptyMessage?: string | null
      unsupportedMessage?: string | null
      renderKey?: string | number
      keepChartWhileLoading?: boolean
      showFooter?: boolean
      chartTitle?: string
      chartClass?: Record<string, boolean>
    }>(),
    {
      loading: false,
      error: null,
      emptyMessage: null,
      unsupportedMessage: null,
      renderKey: undefined,
      keepChartWhileLoading: false,
      showFooter: true,
      chartTitle: undefined,
      chartClass: () => ({}),
    }
  )

  const ctx = useDrilldownContext()
  const slots = useSlots()
  const rootRef = ref<HTMLElement | null>(null)
  const plotRef = ref<HTMLElement | null>(null)
  const { timeWindowMs, onTimeRangeChange } = useDrilldownChartTime(ctx)

  const heightStyle = computed(() => (typeof props.height === 'number' ? `${props.height}px` : props.height))
  const hasOption = computed(() => Boolean(props.option))
  const canRender = computed(() => hasOption.value && (!props.loading || props.keepChartWhileLoading))
  const showLoading = computed(() => props.loading && !canRender.value)
  const showError = computed(() => Boolean(props.error) && !canRender.value)
  const hasFooter = computed(() => props.showFooter && Boolean(slots.footer))
  const resolvedRenderKey = computed(() => String(props.renderKey ?? 'drilldown-chart'))
</script>

<style scoped lang="less">
  .drilldown-chart-panel {
    display: flex;
    flex: 1;
    flex-direction: column;
    min-width: 0;
    min-height: 0;
  }

  .drilldown-chart-panel__loading,
  .drilldown-chart-panel__state {
    display: flex;
    flex: 1;
    align-items: center;
    justify-content: center;
    min-height: v-bind(heightStyle);
  }

  .drilldown-chart-panel__state {
    border: 1px dashed var(--gpt-border-default);
    border-radius: var(--gpt-radius-md);
    color: var(--gpt-text-secondary);
    font-size: var(--gpt-font-base);
  }

  .drilldown-chart-panel__state--error {
    color: var(--gpt-danger);
  }

  .drilldown-chart-panel__chart {
    position: relative;
    display: flex;
    flex: 1;
    min-width: 0;
    min-height: 0;
    overflow: hidden;
    border-radius: var(--gpt-radius-md);
    background: var(--gpt-bg-panel);

    > :deep(.chart-wrap) {
      flex: 1 1 auto;
      min-width: 0;
    }
  }

  .drilldown-chart-panel__mask {
    position: absolute;
    inset: 0;
    z-index: 2;
    display: flex;
    align-items: center;
    justify-content: center;
    pointer-events: none;
    background: color-mix(in srgb, var(--gpt-bg-panel) 55%, transparent);
  }

  .drilldown-chart-panel__footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--gpt-gap-md);
    margin-top: var(--gpt-gap-xs);
  }
</style>
