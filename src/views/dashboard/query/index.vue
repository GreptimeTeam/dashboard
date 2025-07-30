<template lang="pug">
a-layout.new-layout
  a-layout-sider(:resize-directions="['right']" :width="320" :class="hideSidebar ? 'hide-sider' : ''")
    TableManager(:databaseList="databaseList")
  a-layout-content.layout-content(:class="{ 'has-panel': !footer[activeTab] }")
    a-space.layout-space(direction="vertical" fill :size="0")
      a-space.editor-space(
        align="start"
        fill
        direction="vertical"
        :size="0"
      )
        Editor(@select-explain-tab="selectExplainTab")
        DataView(
          v-if="!!results?.length || !!explainResult"
          ref="dataViewRef"
          :results="results"
          :types="types"
          :explainResult="explainResult"
          @update:explainResult="(val) => (explainResult = val)"
        )
      a-resize-box.panel-resize(
        v-model:height="logsHeight"
        :directions="['top']"
        :style="{ 'max-height': '40vh', 'min-height': '66px' }"
      )
        a-tabs.panel-tabs
          a-tab-pane(title="Log" key="log")
            LogsNew(:logs="queryLogs")
</template>

<script lang="ts" setup name="QueryNew">
  import { useMagicKeys, useActiveElement, useStorage } from '@vueuse/core'
  import { driver } from 'driver.js'
  import 'driver.js/dist/driver.css'
  import { navbarSteps, tableSteps } from '../config'

  const { s, q } = useMagicKeys()
  const activeElement = useActiveElement()
  const { hideSidebar, databaseList } = storeToRefs(useAppStore())
  const { logs } = storeToRefs(useLogStore())
  const { activeTab, footer } = storeToRefs(useIngestStore())
  const { dataStatusMap } = storeToRefs(useUserStore())
  const { originTablesTree } = storeToRefs(useDataBaseStore())
  const { queryType, getResultsByType } = useQueryCode()
  const { explainResult } = storeToRefs(useCodeRunStore())
  const types = ['sql', 'promql']
  const logsHeight = ref(66)
  const results = computed(() => getResultsByType(types))
  const queryLogs = computed(() => logs.value.filter((log) => types.includes(log.type)))
  const dataViewRef = ref(null)

  watch(s, (v) => {
    if (
      activeElement.value?.tagName !== 'INPUT' &&
      activeElement.value?.tagName !== 'TEXTAREA' &&
      !activeElement.value?.classList?.contains('cm-content')
    )
      queryType.value = 'sql'
  })
  watch(q, (v) => {
    if (
      activeElement.value?.tagName !== 'INPUT' &&
      activeElement.value?.tagName !== 'TEXTAREA' &&
      !activeElement.value?.classList?.contains('cm-content')
    )
      queryType.value = 'promql'
  })

  const selectExplainTab = () => {
    if (dataViewRef.value) {
      dataViewRef.value.selectTab('explain')
    }
  }

  const globalTour = driver({
    showProgress: false,
    allowClose: false,
    disableActiveInteraction: true,
    overlayOpacity: 0.4,
    showButtons: ['next', 'close'],
    stagePadding: 7,
    stageRadius: 4,
    popoverClass: 'global',
    popoverOffset: 10,
    steps: [],

    onCloseClick: () => {
      const tourStatus = useStorage('tourStatus', { navbar: false })
      tourStatus.value.navbar = true
      globalTour.destroy()
    },
    onNextClick: () => {
      const tourStatus = useStorage('tourStatus', { navbar: false })
      tourStatus.value.navbar = true
      globalTour.moveNext()
      if (!globalTour.getActiveStep()) {
        globalTour.destroy()
      }
    },
  })

  onActivated(async () => {
    const tourStatus = useStorage('tourStatus', { navbar: false })
    if (!tourStatus.value.navbar) {
      const steps = [...navbarSteps]
      globalTour.setSteps(steps)
      globalTour.drive(0)
    }
  })

  // TODO: add more code type in the future if needed
</script>

<style lang="less" scoped>
  .new-layout {
    :deep(.layout-space > .arco-space-item:first-of-type) {
      padding-left: 0;
    }
  }
  :deep(.editor-space) {
    padding-top: 10px;
    height: 100%;
    padding-right: 6px;
    .editor-card .ͼ1.cm-editor {
      border-radius: 4px 4px 0 0;
    }
    > .arco-space-item {
      width: 100%;
      padding-right: 0;
      > .arco-scrollbar {
        width: 100%;
        > .arco-scrollbar-track-direction-vertical {
          padding-left: 15px;
        }
      }
      &:nth-of-type(2) {
        flex: 1;
        overflow: auto;
      }
    }
    .editor-card {
      padding-right: 1px;
      .arco-resizebox-trigger-icon-wrapper {
        font-size: 12px;
      }
    }
  }
</style>
