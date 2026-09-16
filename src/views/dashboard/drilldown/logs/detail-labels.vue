<template lang="pug">
.detail-labels(ref="paneScrollRoot")
  .label-grid
    article.column-card(v-for="key in labelKeys" :key="key")
      .card-header
        span.card-title(:title="key") {{ key }}
      .card-body
        LogsVolumeMiniChart(
          breakdown="column"
          legend="bottom"
          :label-col="key"
          :scroll-root="paneScrollRoot"
          :enabled="logsTab === 'labels'"
        )
    .labels-empty(v-if="!loadingKeys && !labelKeys.length")
      a-empty(:description="t('drilldown.logs.pickLabelHint')")
</template>

<script setup lang="ts">
  import { onMounted, ref, watch } from 'vue'
  import { useI18n } from 'vue-i18n'
  import { useDrilldownContext } from '@/observability/context'
  import { listLabelKeys } from '@/observability/adapters/logs'
  import { METRIC_PANEL_HEIGHT } from '@/observability/metrics/panel-stats'
  import LogsVolumeMiniChart from './logs-volume-mini-chart.vue'

  const { t } = useI18n()
  const ctx = useDrilldownContext()
  const { logsTab } = ctx
  const paneScrollRoot = ref<HTMLElement | null>(null)
  const loadingKeys = ref(false)
  const labelKeys = ref<string[]>([])
  const panelHeightPx = `${METRIC_PANEL_HEIGHT}px`

  async function loadKeys() {
    loadingKeys.value = true
    try {
      const keys = await listLabelKeys(ctx)
      labelKeys.value = Array.isArray(keys) ? keys : []
    } finally {
      loadingKeys.value = false
    }
  }

  onMounted(loadKeys)

  watch(
    () => [ctx.logsTable.value, ctx.refreshKey.value] as const,
    () => {
      loadKeys()
    }
  )
</script>

<style scoped lang="less">
  .detail-labels {
    display: flex;
    flex-direction: column;
    height: 100%;
    min-height: 0;
    overflow: auto;
  }

  .label-grid {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: var(--gpt-gap-md);
    padding: var(--gpt-gap-lg) var(--gpt-page-padding-x) 0;

    @media (max-width: 1400px) {
      grid-template-columns: repeat(3, minmax(0, 1fr));
    }

    @media (max-width: 1100px) {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }

  .column-card {
    display: flex;
    flex-direction: column;
    gap: var(--gpt-gap-md);
    min-width: 0;
    min-height: v-bind(panelHeightPx);
    padding: var(--gpt-gap-lg) var(--gpt-gap-lg) var(--gpt-gap-md);
    border: 1px solid var(--color-border-2);
    border-radius: var(--gpt-radius-md);
    background: var(--color-bg-2);
  }

  .card-header {
    display: flex;
    align-items: baseline;
    min-width: 0;
  }

  .card-title {
    overflow: hidden;
    font-size: var(--gpt-font-md);
    font-weight: var(--gpt-font-weight-control);
    line-height: 1.35;
    color: var(--color-text-1);
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .card-body {
    display: flex;
    flex: 1;
    flex-direction: column;
    min-height: 0;
  }

  .labels-empty {
    display: flex;
    grid-column: 1 / -1;
    align-items: center;
    justify-content: center;
    min-height: 160px;
  }
</style>
