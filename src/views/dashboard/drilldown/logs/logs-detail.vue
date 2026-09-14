<template lang="pug">
.logs-detail(ref="detailScrollRef")
  a-tabs.logs-detail-tabs.panel-tabs(v-model:active-key="activeTab" lazy-load)
    a-tab-pane(key="logs" :title="t('drilldown.logs.logsTab')")
      .logs-tab-pane
        .logs-tab-chart
          button.logs-tab-chart-header(
            type="button"
            :aria-expanded="chartExpanded"
            :aria-label="chartExpanded ? t('drilldown.logs.volumeChartCollapse') : t('drilldown.logs.volumeChartExpand')"
            @click="chartExpanded = !chartExpanded"
          )
            span.logs-tab-chart-title {{ t('drilldown.logs.volumeChartTitle') }}
            icon-down.logs-tab-chart-caret(:class="{ 'is-collapsed': !chartExpanded }")
          .logs-tab-chart-body(v-show="chartExpanded")
            LogsVolumeMiniChart(:lazy="false" :color-index="0" :height="mainChartHeight")
        .logs-tab-table
          LogsMainView(:show-volume="false" :fill-height="true")
    a-tab-pane(key="labels" destroy-on-hide :title="t('drilldown.logs.labelsTab')")
      .tab-placeholder
        a-empty(:description="t('drilldown.logs.comingSoon')")
    a-tab-pane(key="fields" destroy-on-hide :title="t('drilldown.logs.fieldsTab')")
      .tab-placeholder
        a-empty(:description="t('drilldown.logs.comingSoon')")
</template>

<script setup lang="ts">
  import { ref } from 'vue'
  import { useI18n } from 'vue-i18n'
  import IconDown from '@arco-design/web-vue/es/icon/icon-down'
  import { useDrilldownContext } from '@/observability/context'
  import { BREAKDOWN_CHART_HEIGHT } from '@/observability/metrics/panel-stats'
  import { isLogsDetailTab } from '@/observability/types'
  import useDrilldownPanelTab from '@/observability/use-drilldown-panel-tab'
  import LogsMainView from './logs-main-view.vue'
  import LogsVolumeMiniChart from './logs-volume-mini-chart.vue'

  const { t } = useI18n()
  const { logsTab, setLogsTab } = useDrilldownContext()
  const detailScrollRef = ref<HTMLElement | null>(null)
  /** Shorter than metrics MAIN_CHART_HEIGHT — volume over logs table. */
  const mainChartHeight = BREAKDOWN_CHART_HEIGHT
  const chartExpanded = ref(true)

  const activeTab = useDrilldownPanelTab({
    tab: logsTab,
    setTab: setLogsTab,
    isTab: isLogsDetailTab,
  })
</script>

<style scoped lang="less">
  .logs-detail {
    display: flex;
    flex-direction: column;
    flex: 1;
    height: 100%;
    min-height: 0;
    overflow: auto;
  }

  .logs-detail-tabs {
    flex: 1;
    min-height: 0;
  }

  // No horizontal padding — panel-tabs nav stays edge-to-edge.
  .logs-detail-tabs :deep(.arco-tabs-content) {
    padding: 0;
  }

  // Keep pane as the scrollport so height:100% children get a real bound.
  .logs-detail-tabs :deep(.arco-tabs-content-item) {
    overflow: auto;
  }

  .logs-tab-pane {
    display: flex;
    flex-direction: column;
    height: 100%;
    min-height: 0;
    padding: 0;
    overflow: hidden;
  }

  .logs-tab-chart {
    flex-shrink: 0;
    margin: 0;
    border: 0;
    border-bottom: 1px solid var(--color-border-2);
    border-radius: 0;
    background: var(--color-bg-2);
    overflow: hidden;
  }

  .logs-tab-chart-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    width: 100%;
    height: 36px;
    padding: 0 16px;
    border: 0;
    background: var(--gpt-table-toolbar-bg, var(--color-fill-1));
    cursor: pointer;
    color: var(--color-text-1);

    &:hover {
      background: var(--color-fill-2);
    }
  }

  .logs-tab-chart-title {
    font-size: 13px;
    font-weight: 600;
    line-height: 1;
  }

  .logs-tab-chart-caret {
    flex-shrink: 0;
    color: var(--color-text-3);
    font-size: 12px;
    transition: transform 0.15s ease;

    &.is-collapsed {
      transform: rotate(-90deg);
    }
  }

  .logs-tab-chart-body {
    padding: 0;
  }

  // Full-bleed volume plot — no inset card radius.
  .logs-tab-chart-body :deep(.panel-chart),
  .logs-tab-chart-body :deep(.panel-state) {
    border-radius: 0;
  }

  .logs-tab-chart-body :deep(.panel-state) {
    margin: 0 16px 10px;
  }

  .logs-tab-table {
    display: flex;
    flex: 1 1 0%;
    flex-direction: column;
    min-height: 0;
    overflow: hidden;

    // Match homepage label panels: table bleeds edge-to-edge under the chart.
    :deep(.data-table-container),
    :deep(.arco-table-container) {
      border-radius: 0;
    }
  }

  .tab-placeholder {
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 200px;
    padding: 24px;
  }
</style>
