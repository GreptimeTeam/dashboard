<template>
  <a-spin style="width: 100%">
    <a-table :columns="gridColumn" :data="gridData" />
  </a-spin>
</template>

<script lang="ts" setup>
  import { computed } from 'vue'
  import useDataExplorer from '@/hooks/data-explorer'
  import { useCodeRunStore } from '@/store'
  import { storeToRefs } from 'pinia'

  const codeRunStore = useCodeRunStore()
  const { activeTabKey } = storeToRefs(codeRunStore)

  const { initSqlResult, source, columns } = useDataExplorer()

  initSqlResult()
  const gridColumn = computed(() => {
    const tempArray: any = []
    columns.value[activeTabKey.value].forEach((item: any) => {
      const oneColumn = {
        title: item.name,
        dataIndex: item.name,
        align: 'right',
      }
      tempArray.push(oneColumn)
    })
    return tempArray
  })

  const gridData = computed(() => {
    const temp: any = []
    source.value[activeTabKey.value].forEach((item: any) => {
      const oneRow: any = {}
      item.forEach((value: any, index: any) => {
        oneRow[gridColumn.value[index].title] = value
      })
      temp.push(oneRow)
    })
    return temp
  })
</script>
