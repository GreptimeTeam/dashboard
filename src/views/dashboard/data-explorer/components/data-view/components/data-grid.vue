<template>
  <a-spin style="width: 100%">
    <a-table :columns="gridColumn" :data="gridData" />
  </a-spin>
</template>

<script lang="ts" setup>
  import { computed } from 'vue'
  import useSqlResult from '@/hooks/data-explorer'

  const { source, columns } = useSqlResult()

  const gridColumn = computed(() => {
    const tempArray: any = []
    columns.value.forEach((item: any) => {
      const oneColumn = {
        title: item.name,
        dataIndex: item.name,
      }
      tempArray.push(oneColumn)
    })
    return tempArray
  })

  // todo: responsive data
  const gridData = computed(() => {
    const temp: any = []
    source.value.forEach((item: any) => {
      const one = {
        host: item[0],
        ts: item[1],
        cpu: item[2],
        memory: item[3],
      }
      temp.push(one)
    })
    return temp
  })
</script>
