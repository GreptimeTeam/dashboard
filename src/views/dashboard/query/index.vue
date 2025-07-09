<template lang="pug">
a-layout.new-layout
  a-layout-sider(:resize-directions="['right']" :width="320" :class="isFullScreen ? 'hide-sider' : ''")
    TableManager.query-tables
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
  import { useDatabases } from '@/hooks/databases'
  import { navbarSteps, tableSteps } from '../config'

  const { s, q } = useMagicKeys()
  const activeElement = useActiveElement()
  const { isFullScreen } = storeToRefs(useAppStore())
  const { logs } = storeToRefs(useLogStore())
  const { activeTab, footer } = storeToRefs(useIngestStore())
  const { dataStatusMap } = storeToRefs(useUserStore())
  const { checkTables } = useDataBaseStore()
  const { originTablesTree } = storeToRefs(useDataBaseStore())
  const { queryType, getResultsByType } = useQueryCode()
  const { explainResult } = storeToRefs(useCodeRunStore())

  // 使用 database hook
  const { databases, databasesLoading, subscribe, cleanup } = useDatabases()
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
    // 订阅数据库变化
    subscribe()

    // 等待数据库加载完成后再检查表格
    const checkTablesWhenReady = async () => {
      if (!dataStatusMap.value.tables && databases.value.length > 0) {
        await checkTables()
      }
    }

    // 如果数据库已经加载完成，立即检查表格
    if (!databasesLoading.value && databases.value.length > 0) {
      await checkTablesWhenReady()
    } else {
      // 否则等待数据库加载完成
      watch(
        [databasesLoading, databases],
        async ([loading, dbs]) => {
          if (!loading && dbs.length > 0) {
            await checkTablesWhenReady()
          }
        },
        { immediate: true }
      )
    }

    const tourStatus = useStorage('tourStatus', { navbar: false })
    if (!tourStatus.value.navbar) {
      const steps = [...navbarSteps]
      globalTour.setSteps(steps)
      globalTour.drive(0)
    }
  })

  onDeactivated(() => {
    cleanup()
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

<style lang="less">
  .arco-card.query-tables {
    .arco-tree.table-tree {
      .arco-tree-node {
        border: none;
        padding: 0px 0px 0 12px;
        > .arco-tree-node-title {
          margin-left: 2px;
        }
        &:not(.arco-tree-node-is-leaf) {
          > .arco-tree-node-title {
            padding: 2px 0;
          }
        }
        &.arco-tree-node-is-leaf.arco-tree-node-is-tail {
          margin-bottom: 0;
        }
      }
      .icon-16 {
        height: 14px;
        width: 14px;
      }
      .icon {
        height: 13px;
        width: 13px;
      }
    }

    .title-copy {
      .arco-btn-size-medium.arco-btn-only-icon {
        width: 24px;
        height: 24px;
      }
      .arco-typography-operation-copy,
      .arco-typography-operation-copied {
        display: flex;
      }
      &.columns {
        margin-left: 0;
      }
    }
    .arco-btn-size-small.arco-btn-only-icon {
      width: 24px;
      height: 24px;
    }
  }
</style>
