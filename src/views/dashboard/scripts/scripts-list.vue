<template lang="pug">
a-scrollbar.tree-scrollbar
  a-tree.script-tree(:data="scriptsList" size="small" @select="onSelect" blockNode v-model:selected-keys="scriptSelectedKeys")
</template>

<script lang="ts" name="ScriptsList" setup>
  import { storeToRefs } from 'pinia'
  import { useDataBaseStore } from '@/store'
  import useDataExplorer from '@/hooks/data-explorer'

  const dataBaseStore = useDataBaseStore()
  const dataExplorer = useDataExplorer()

  const { insertNameToCode } = dataExplorer
  const { fetchScriptsTable } = dataBaseStore
  const { scriptsList } = storeToRefs(dataBaseStore)

  const scriptSelectedKeys = ref([])
  const initTableDataSet = () => {
    dataBaseStore.fetchDataBaseTables()
  }

  const onSelect = (newSelectedKeys: [], event: any) => {
    console.log('select: ', newSelectedKeys, event)
  }
  fetchScriptsTable()
</script>
