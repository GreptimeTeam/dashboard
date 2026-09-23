<template lang="pug">
.detail-labels(ref="paneScrollRoot")
  .label-grid.drilldown-grid.drilldown-grid--logs-labels
    article.column-card.drilldown-card(v-for="key in labelKeys" :key="key")
      .drilldown-card__header
        span.drilldown-card__title(:title="key") {{ key }}
      .drilldown-card__body
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

  .labels-empty {
    display: flex;
    grid-column: 1 / -1;
    align-items: center;
    justify-content: center;
    min-height: 160px;
  }

  .column-card {
    min-height: v-bind(panelHeightPx);
  }
</style>
