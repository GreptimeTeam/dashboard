<template lang="pug">
.logs-detail(ref="detailScrollRef")
  .logs-tab-pane(
    :class="{ 'is-hidden': logsTab !== 'logs' }"
    :inert="logsTab !== 'logs'"
    :aria-hidden="logsTab !== 'logs'"
  )
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
        LogsVolumeMiniChart(
          sync-severity-filter
          legend="bottom"
          :lazy="false"
          :height="mainChartHeight"
          :extra-where="bodyWhere"
        )
    .logs-tab-table
      LogsMainView(:show-volume="false" :fill-height="true" :extra-where="bodyWhere")
  DetailLabels(v-if="logsTab === 'labels'")
</template>

<script setup lang="ts">
  import { ref } from 'vue'
  import { useI18n } from 'vue-i18n'
  import IconDown from '@arco-design/web-vue/es/icon/icon-down'
  import { useDrilldownContext } from '@/observability/context'
  import { BREAKDOWN_CHART_HEIGHT } from '@/observability/metrics/panel-stats'
  import useLogsBodyPredicate from '@/observability/use-logs-body-predicate'
  import DetailLabels from './detail-labels.vue'
  import LogsMainView from './logs-main-view.vue'
  import LogsVolumeMiniChart from './logs-volume-mini-chart.vue'

  const { t } = useI18n()
  const { logsTab } = useDrilldownContext()
  const bodyWhere = useLogsBodyPredicate()
  const detailScrollRef = ref<HTMLElement | null>(null)
  /** Shorter than metrics MAIN_CHART_HEIGHT — volume over logs table. */
  const mainChartHeight = BREAKDOWN_CHART_HEIGHT
  const chartExpanded = ref(true)
</script>

<style scoped lang="less">
  .logs-detail {
    position: relative;
    display: flex;
    flex-direction: column;
    flex: 1;
    height: 100%;
    min-height: 0;
    overflow: hidden;
  }

  // Stay sized while the Labels tab is open so the virtual list is not torn down.
  // The drawer unmounts this pane only when detail closes.
  .logs-tab-pane {
    position: absolute;
    inset: 0;
    z-index: 0;
    display: flex;
    flex-direction: column;
    min-height: 0;
    padding: 0;
    overflow: hidden;

    &.is-hidden {
      visibility: hidden;
      pointer-events: none;
    }
  }

  .logs-detail :deep(.detail-labels) {
    position: relative;
    z-index: 1;
  }

  .logs-tab-chart {
    flex-shrink: 0;
    margin: 0;
    border: 0;
    border-bottom: 1px solid var(--gpt-border-default);
    border-radius: 0;
    background: var(--gpt-bg-panel);
    overflow: hidden;
  }

  .logs-tab-chart-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--gpt-gap-md);
    width: 100%;
    height: 36px;
    padding: 0 var(--gpt-page-padding-x);
    border: 0;
    background: var(--gpt-table-toolbar-bg);
    cursor: pointer;
    color: var(--gpt-text-primary);

    &:hover {
      background: var(--gpt-nav-active-bg);
    }
  }

  .logs-tab-chart-title {
    font-size: var(--gpt-font-md);
    font-weight: var(--gpt-font-weight-control);
    line-height: 1;
  }

  .logs-tab-chart-caret {
    flex-shrink: 0;
    color: var(--gpt-text-muted);
    font-size: var(--gpt-font-base);
    transition: transform 0.15s ease;

    &.is-collapsed {
      transform: rotate(-90deg);
    }
  }

  .logs-tab-chart-body {
    padding: var(--gpt-gap-md) var(--gpt-page-padding-x) var(--gpt-gap-lg);
  }

  .logs-tab-chart-body :deep(.logs-volume-mini-chart) {
    gap: var(--gpt-gap-md);
  }

  .logs-tab-chart-body :deep(.panel-chart),
  .logs-tab-chart-body :deep(.panel-state) {
    border-radius: var(--gpt-radius-md);
  }

  .logs-tab-chart-body :deep(.panel-footer) {
    margin-top: 0;
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
</style>
