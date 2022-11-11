<template>
  <a-tree :data="tableList" :load-more="loadMore">
    <template #extra="nodeData">
      <a-tooltip content="Insert Name Into Editor" mini background-color="#722ED1">
        <icon-copy style="position: absolute; right: 8px; font-size: 20px" @click="insertNameToCode(nodeData.title)" />
      </a-tooltip>
    </template>
  </a-tree>
</template>

<script lang="ts" setup>
  import { storeToRefs } from 'pinia'
  import { useDataBaseStore } from '@/store'
  import useDataExplorer from '@/hooks/data-explorer'

  const dataBaseStore = useDataBaseStore()
  const dataExplorer = useDataExplorer()

  const { tableList } = storeToRefs(dataBaseStore)
  const { insertNameToCode } = dataExplorer

  const initTableDataSet = () => {
    dataBaseStore.fetchDataBaseTables()
  }

  // todo: maybe load more
  const loadMore = (nodeData: any) => {
    return new Promise<void>((resolve) => {
      setTimeout(() => {
        nodeData.children = [{ title: `leaf`, key: `-1`, isLeaf: true }]
        resolve()
      }, 1000)
    })
  }
  initTableDataSet()
</script>
