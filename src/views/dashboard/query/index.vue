<template lang="pug">
a-layout.layout
  a-layout-sider.tables-sider(style="width: 66.6%" :resize-directions="['right']" @moving-end="moveEnd")
    TableManager(:class="tableManagerElement?.offsetWidth <= 650 ? 'small' : 'big'")
  a-layout-content.logs-content
    LogsLayout(:logs="queryLogs" :types="types")
</template>

<script lang="ts" name="Query" setup>
  import { useMagicKeys, useActiveElement, useStorage } from '@vueuse/core'
  import { driver } from 'driver.js'
  import 'driver.js/dist/driver.css'
  import { navbarSteps, tableSteps } from '../config'

  const { s, q } = useMagicKeys()
  const activeElement = useActiveElement()
  const { queryType, getResultsByType } = useQueryCode()
  const { fetchDatabases } = useAppStore()
  const { checkTables } = useDataBaseStore()
  const { guideModalVisible } = storeToRefs(useAppStore())
  const { originTablesTree } = storeToRefs(useDataBaseStore())
  const { dataStatusMap } = storeToRefs(useUserStore())
  const { logs } = storeToRefs(useLogStore())

  const MENU_WIDTH = 242 + 16
  const MODAL_WIDTH = 636
  const OTHERS_WIDTH = `${MENU_WIDTH + MODAL_WIDTH}px`
  const RESIZE_BOX_WIDTH = 12
  const TABLES_MIN_WIDTH = `${508 + RESIZE_BOX_WIDTH}px`

  const tableManagerElement = ref<any>()

  onMounted(() => {
    tableManagerElement.value = document.getElementsByClassName('table-manager')[0]
  })
  const moveEnd = () => {
    tableManagerElement.value = document.getElementsByClassName('table-manager')[0]
  }

  const types = ['sql', 'promql']

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
  .arco-layout-sider.tables-sider {
    min-width: v-bind(TABLES_MIN_WIDTH);
    max-width: calc(100vw - v-bind(OTHERS_WIDTH));
  }
  .logs-content {
    padding: 0 16px 0 0;
  }
  :deep(.arco-resizebox-trigger-icon-wrapper) {
    color: var(--main-font-color);
    font-size: 18px;
    width: 16px;
    background-color: transparent;
  }
</style>
