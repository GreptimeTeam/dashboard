<template lang="pug">
.breakdown-value-card
  .card-header
    span.card-title {{ labelKey }}="{{ value }}"
    a-button(
      v-if="canAddToFilter"
      type="outline"
      size="mini"
      @click="addToFilter"
    )
      | {{ t('drilldown.filters.addToFilter') }}
  .card-body
    BreakdownMiniChart(
      mode="value"
      :metric="metric"
      :label-key="labelKey"
      :value="value"
      :scroll-root="scrollRoot"
    )
</template>

<script setup lang="ts">
  import { computed, type Ref } from 'vue'
  import { useI18n } from 'vue-i18n'
  import { useDrilldownContext } from '@/observability/context'
  import BreakdownMiniChart from './breakdown-mini-chart.vue'

  const props = defineProps<{
    metric: string
    labelKey: string
    value: string
    scrollRoot: Ref<HTMLElement | null | undefined>
  }>()

  const { t } = useI18n()
  const ctx = useDrilldownContext()

  const canAddToFilter = computed(() => Boolean(props.value) && props.value !== '<unspecified>')

  const addToFilter = () => {
    if (!canAddToFilter.value) {
      return
    }
    ctx.appendFilter({ key: props.labelKey, op: '=', value: props.value })
  }
</script>

<style scoped lang="less">
  .breakdown-value-card {
    display: flex;
    flex-direction: column;
    gap: 8px;
    border: 1px solid var(--color-border-2);
    border-radius: 8px;
    padding: 12px;
    background: var(--color-bg-2);
  }

  .card-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }

  .card-title {
    font-size: 12px;
    color: var(--color-text-1);
    font-family: var(--vp-font-family-base);
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .card-body {
    min-width: 0;
  }
</style>
