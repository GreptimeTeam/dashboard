<template>
  <span>Table</span>
  <a-tree :data="tableList" :load-more="loadMore">
    <template #extra="nodeData">
      <IconPlus
        style="position: absolute; right: 8px; font-size: 12px; top: 10px; color: #3370ff"
        @click="insertCode(nodeData.title)"
      />
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
  const { insertCode } = dataExplorer

  // todo: delete promise
  const initTableDataSet = () => {
    return new Promise<void>(() => {
      setTimeout(() => {
        dataBaseStore.fetchDataBaseTables()
      }, 1000)
    })
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
