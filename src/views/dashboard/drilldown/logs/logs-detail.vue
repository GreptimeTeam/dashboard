<template lang="pug">
.logs-detail(ref="detailScrollRef")
  .logs-detail-main
    LogsMainView

  a-tabs.logs-detail-tabs.panel-tabs(v-model:active-key="activeTab" lazy-load)
    a-tab-pane(key="labels" :title="t('drilldown.logs.labelsTab')")
      LabelsTab
    a-tab-pane(key="fields" destroy-on-hide :title="t('drilldown.logs.fieldsTab')")
      .tab-placeholder
        a-empty(:description="t('drilldown.logs.comingSoon')")
</template>

<script setup lang="ts">
  import { computed, ref } from 'vue'
  import { useI18n } from 'vue-i18n'
  import { useDrilldownContext } from '@/observability/context'
  import { isLogsDetailTab } from '@/observability/types'
  import LabelsTab from './labels-tab.vue'
  import LogsMainView from './logs-main-view.vue'

  const { t } = useI18n()
  const { logsTab, setLogsTab } = useDrilldownContext()
  const detailScrollRef = ref<HTMLElement | null>(null)

  const activeTab = computed({
    get: () => (logsTab.value === 'logs' ? 'labels' : logsTab.value),
    set: (key: string | number) => {
      if (isLogsDetailTab(key) && key !== 'logs') {
        setLogsTab(key)
      }
    },
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

  .logs-detail-main {
    flex-shrink: 0;
    padding: 12px 16px;
  }

  .logs-detail-tabs {
    flex: 1;
    min-height: 0;
  }

  .logs-detail-tabs :deep(.arco-tabs-content) {
    padding: 0;
  }

  .logs-detail-tabs :deep(.arco-tabs-content-item) {
    overflow: auto;
  }

  .tab-placeholder {
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 200px;
    padding: 24px;
  }
</style>
