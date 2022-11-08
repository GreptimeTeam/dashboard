<template>
  <a-tree :data="tableList" />

  <a-button @click="insertCode('table add')">add</a-button>
</template>

<script lang="ts" setup>
  import { computed } from 'vue'
  import { useDataBaseStore } from '@/store'
  import useDataExplorer from '@/hooks/data-explorer'

  const dataBaseStore = useDataBaseStore()
  const dataExplorer = useDataExplorer()

  const tableList = computed(() => dataBaseStore.makeTableList)
  const { insertCode } = dataExplorer

  // todo: delete promise
  const initTableDataSet = () => {
    return new Promise<void>(() => {
      setTimeout(() => {
        dataBaseStore.fetchDataBaseTables()
      }, 1000)
    })
  }
  initTableDataSet()
</script>
