<template lang="pug">
a-layout.layout
  a-layout-sider.tables-sider(style="width: 66.6%" :resize-directions="['right']" @moving-end="moveEnd")
    TableManager(:class="tableManagerElement?.offsetWidth <= 650 ? 'small' : 'big'")
  a-layout-content.logs-content
    LogsLayout(:logs="queryLogs" :types="types")
</template>

<script lang="ts" name="Query" setup>
  import { useMagicKeys, useActiveElement } from '@vueuse/core'

  const { s, q } = useMagicKeys()
  const activeElement = useActiveElement()
  const { queryType } = useQueryCode()
  const { guideModalVisible } = storeToRefs(useAppStore())
  const { checkTables } = useDataBaseStore()
  const { dataStatusMap } = storeToRefs(useUserStore())

  const { logs } = storeToRefs(useLogStore())
  const { getResultsByType } = useQueryCode()

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

  onActivated(() => {
    if (!guideModalVisible.value) {
      if (!dataStatusMap.value.tables) {
        checkTables()
      }
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
