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
        Editor
        DataView.modal-view(v-if="!!results?.length" :results="results" :types="types")
      a-resize-box.panel-resize(
        v-model:height="logsHeight"
        :directions="['top']"
        :style="{ 'max-height': '40vh', 'min-height': '66px' }"
      )
        a-tabs.panel-tabs
          a-tab-pane(title="Log" key="log")
            LogsNew(:types="types" :logs="queryLogs")
</template>

<script lang="ts" setup name="QueryNew">
  import { useMagicKeys, useActiveElement, useStorage } from '@vueuse/core'
  import { driver } from 'driver.js'
  import 'driver.js/dist/driver.css'
  import { navbarSteps, tableSteps } from '../config'

  const { s, q } = useMagicKeys()
  const activeElement = useActiveElement()
  const { isFullScreen } = storeToRefs(useAppStore())
  const { logs } = storeToRefs(useLogStore())
  const { activeTab, footer } = storeToRefs(useIngestStore())
  const { dataStatusMap } = storeToRefs(useUserStore())
  const { fetchDatabases } = useAppStore()
  const { checkTables } = useDataBaseStore()
  const { originTablesTree } = storeToRefs(useDataBaseStore())
  const { queryType, getResultsByType } = useQueryCode()
  const types = ['sql', 'promql']
  const logsHeight = ref(66)
  const results = computed(() => getResultsByType(types))
  const queryLogs = computed(() => logs.value.filter((log) => types.includes(log.type)))

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
    if (!dataStatusMap.value.tables) {
      await fetchDatabases()
      await checkTables()
    }
    const tourStatus = useStorage('tourStatus', { navbar: false })
    if (!tourStatus.value.navbar) {
      const steps = originTablesTree.value.length > 0 ? [...navbarSteps, ...tableSteps] : [...navbarSteps]
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
    > .arco-space-item {
      width: 100%;
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
      .arco-resizebox-trigger-icon-wrapper {
        font-size: 12px;
      }
    }
  }
  :deep(.modal-view) {
    > .arco-tabs-content {
      > .arco-tabs-content-list > .arco-tabs-content-item {
        padding: 0;
        .arco-tabs-nav-ink {
          background: transparent;
        }
        .arco-tabs-nav-tab-list > :nth-child(2) {
          .arco-tabs-tab-title {
            border-left: 1px solid var(--border-color);
          }
        }
        .arco-tabs-tab {
          padding: 2px 0;
          margin: 0;
          color: var(--main-font-color);
          &:first-of-type {
            border-top-left-radius: 4px;
            border-bottom-left-radius: 4px;
          }
          &:nth-last-of-type(2) {
            border-top-right-radius: 4px;
            border-bottom-right-radius: 3px;
          }
          &.arco-tabs-tab-active {
            color: var(--brand-color);
            font-weight: 400;
          }
          > .arco-tabs-tab-title {
            width: 84px;
            padding-left: 10px;
            display: flex;
            font-size: 12px;
            height: 20px;
            &::before {
              border-radius: 4px;
              left: 0;
              right: 0;
              top: -6px;
              bottom: -6px;
            }
          }
        }
      }
    }
    > .arco-tabs-nav-type-rounded {
      border-bottom: 1px solid var(--border-color);
      padding-bottom: 0;
      // .arco-icon-hover:hover::before {
      //   width: 20px;
      //   background-color: var(--card-bg-color);
      // }
      > .arco-tabs-nav-tab {
        > .arco-tabs-nav-tab-list {
          > .arco-tabs-tab:not(:last-of-type) {
          }
          > .arco-tabs-tab {
            border-radius: 0;
            padding: 7px 6px;
            font-size: 12px;
            line-height: 12px;
          }
        }
      }
    }
    .data-view-tabs > .arco-tabs-content > .arco-tabs-content-list > .arco-tabs-content-item {
      padding: 0;
    }
    .arco-table.data-table .arco-table-container {
      border-radius: 0;
      border: none;
    }
    .arco-table-size-mini .arco-table-td {
      font-size: 11px;
    }
    .arco-table-size-mini .arco-table-th {
      padding: 4px 0;
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
    .arco-space.table-buttons {
      > .arco-space-item:nth-of-type(1) {
        display: none;
      }
      > .arco-space-item:nth-of-type(2) {
        display: none;
      }
      > .arco-space-item:nth-of-type(3) {
        margin-right: 0;
        .arco-btn-size-small.arco-btn-only-icon {
          width: 24px;
          height: 24px;
        }
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
