<template lang="pug">
a-scrollbar.tree-scrollbar
  a-tree.table-tree(:data="tableList" size="small")
    template(#title)
    template(#extra="nodeData")
      span.tree-title
        | {{ nodeData.title }}
      span.data-type
        | {{ nodeData.dataType }}
      a-tooltip(:content="$t('dataExplorer.insertName')" mini)
        svg.icon.copy-icon.pointer(name="copy" @click="insertNameToCode(nodeData.title)")
          use(href="#copy")
</template>

<script lang="ts" name="ScriptsList" setup>
  import { storeToRefs } from 'pinia'
  import { useDataBaseStore } from '@/store'
  import useDataExplorer from '@/hooks/data-explorer'

  const dataBaseStore = useDataBaseStore()
  const dataExplorer = useDataExplorer()

  const { insertNameToCode } = dataExplorer

  const initTableDataSet = () => {
    dataBaseStore.fetchDataBaseTables()
  }
  const { fetchOneTable } = dataBaseStore
  const { tableList, ifTableLoading, tableKey } = storeToRefs(dataBaseStore)

  initTableDataSet()
</script>
