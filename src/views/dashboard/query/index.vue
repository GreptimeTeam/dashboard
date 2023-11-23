<template lang="pug">
a-layout.layout
  a-layout-sider.tables-sider(style="width: 66.6%" :resize-directions="['right']")
    TableManager
  a-layout-content
    LogsLayout(:logs="queryLogs" :types="types")
</template>

<script lang="ts" name="Query" setup>
  import { useMagicKeys, useActiveElement } from '@vueuse/core'

  const { s, q } = useMagicKeys()
  const activeElement = useActiveElement()
  const { queryType } = useQueryCode()
  const { guideModalVisible } = storeToRefs(useAppStore())
  const { getTables } = useDataBaseStore()
  const { dataStatusMap } = storeToRefs(useUserStore())

  const { logs } = storeToRefs(useLogStore())
  const { getResultsByType } = useQueryCode()

  const MENU_WIDTH = 258 + 16
  const MODAL_WIDTH = 636
  const OTHERS_WIDTH = `${MENU_WIDTH + MODAL_WIDTH}px`

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
        getTables()
      }
    }
  })

  // TODO: add more code type in the future if needed
</script>

<style lang="less" scoped>
  .arco-layout-sider.tables-sider {
    width: 66.6%;
    min-width: 500px;
    max-width: calc(100vw - v-bind(OTHERS_WIDTH));
  }
</style>
