<template lang="pug">
a-layout.new-layout
  a-resize-box(
    v-model:width="sidebarWidth"
    :directions="['right']"
    :style="{ 'min-width': '100px', 'max-width': '40vw' }"
    :class="hideSidebar ? 'hide-sider' : ''"
  )
    a-layout-sider(:width="actualSidebarWidth")
      TableManager(:databaseList="databaseList")
  a-layout-content.layout-content.has-panel
    a-space.layout-space(direction="vertical" fill :size="0")
      a-space.editor-space(
        align="start"
        fill
        direction="vertical"
        :size="0"
      ) 
        Editor
        DataView(
          v-if="!!session.results.value?.length || session.explainResults.value.length > 0"
          :is-in-full-size-mode="false"
          @toggle-full-size="handleToggleFullSize"
        )
        .data-view-placeholder(v-else)
      a-resize-box.panel-resize(
        v-model:height="logsHeight"
        :directions="['top']"
        :style="{ 'max-height': '40vh', 'min-height': '66px' }"
      )
        a-tabs.panel-tabs
          a-tab-pane(title="Log" key="log")
            LogsNew(:logs="session.queryLogs.value")

  a-modal.full-size-modal(
    v-model:visible="isFullSizeMode"
    :class="{ 'full-screen': isFullSizeMode }"
    :align-center="false"
    :footer="false"
    :closable="false"
    :header="false"
    :esc-to-close="true"
    :mask-style="{ backgroundColor: 'transparent', 'pointer-events': 'auto' }"
  )
    DataView.full-size(
      v-if="!!session.results.value?.length || session.explainResults.value.length > 0"
      :show-full-size-button="false"
      :is-in-full-size-mode="true"
      @toggle-full-size="isFullSizeMode = false"
    )
</template>

<script lang="ts" setup name="query">
  import { useMagicKeys, useActiveElement, useStorage } from '@vueuse/core'
  import { driver } from 'driver.js'
  import 'driver.js/dist/driver.css'
  import { navbarSteps, tableSteps } from '../config'
  import { provideQuerySession } from './use-query-session'

  defineOptions({
    name: 'Query',
  })

  const { s, q, escape } = useMagicKeys()
  const activeElement = useActiveElement()
  const appStore = useAppStore()
  const { hideSidebar, databaseList, database } = storeToRefs(useAppStore())
  const originalDatabase = ref<string | undefined>(undefined)
  const { queryType } = useQueryCode()
  const session = provideQuerySession()
  const types = ['sql', 'promql']
  const logsHeight = ref(66)
  const isFullSizeMode = ref(false)

  const sidebarWidth = useStorage('sidebarWidth', 228)

  watch(sidebarWidth, (newWidth) => {
    if (newWidth < 100) {
      sidebarWidth.value = 100
    }
  })

  const actualSidebarWidth = computed(() => {
    const minWidth = 180
    const maxWidth = window.innerWidth * 0.4
    return Math.max(minWidth, Math.min(sidebarWidth.value, maxWidth))
  })

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

  watch(escape, (v) => {
    if (v && isFullSizeMode.value) {
      isFullSizeMode.value = false
    }
  })

  const handleToggleFullSize = (fullSize: boolean) => {
    isFullSizeMode.value = fullSize
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
    originalDatabase.value = database.value
    await appStore.refreshDatabaseList()
    const tourStatus = useStorage('tourStatus', { navbar: false })
    if (!tourStatus.value.navbar) {
      const steps = [...navbarSteps]
      globalTour.setSteps(steps)
      globalTour.drive(0)
    }
  })

  onDeactivated(() => {
    database.value = originalDatabase.value
    originalDatabase.value = undefined
  })

  // TODO: add more code type in the future if needed
</script>

<style lang="less" scoped>
  :deep(.arco-layout-sider-light) {
    box-shadow: none !important;
  }
  .new-layout {
    background: var(--gpt-bg-app);
    :deep(> .arco-layout-content.layout-content.has-panel) {
      background: var(--gpt-bg-app);
    }
    :deep(.arco-layout-sider) {
      border-right: 1px solid var(--gpt-border-strong);
      background: var(--gpt-bg-panel);
    }
    :deep(.layout-space > .arco-space-item:first-of-type) {
      padding-left: 0;
    }
  }
  :deep(.editor-space) {
    padding-top: 0px;
    height: 100%;
    padding-right: 6px;
    .editor-card .ͼ1.cm-editor {
      border-radius: 4px;
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
  :deep(.panel-resize) {
    border-top: 1px solid var(--gpt-border-default);
    background: var(--gpt-bg-panel);
  }
</style>

<style lang="less">
  .full-size-modal {
    .arco-modal-wrapper {
      overflow: hidden;
      .arco-modal {
        pointer-events: auto;
        box-shadow: 0 2px 10px 0 var(--box-shadow-color);
        width: calc(100vw - var(--navbar-width-collapsed) - 16px);
        border: 1px solid var(--border-color);
        .arco-modal-body {
          padding: 8px 16px;
          height: calc(100vh - var(--footer-height) - 20px);
        }
      }
    }

    &.full-screen {
      .arco-modal {
        transform: none !important;
        position: fixed !important;
        right: 6px !important;
        top: 10px !important;
      }
    }
  }
</style>
