<template lang="pug">
a-scrollbar.tree-scrollbar
  a-tree.script-tree(:data="scriptsList" size="small" @select="onSelect" blockNode v-model:selected-keys="scriptSelectedKeys")
</template>

<script lang="ts" name="ScriptsList" setup>
  import { storeToRefs } from 'pinia'
  import { useDataBaseStore } from '@/store'
  import useDataExplorer from '@/hooks/data-explorer'
  import usePythonCode from '@/hooks/python-code'

  const dataBaseStore = useDataBaseStore()
  const dataExplorer = useDataExplorer()

  const { insertNameToCode } = dataExplorer
  const { pythonCode } = usePythonCode()
  const { fetchScriptsTable } = dataBaseStore
  const { scriptsList } = storeToRefs(dataBaseStore)

  const scriptSelectedKeys = ref([])
  const initTableDataSet = () => {
    dataBaseStore.fetchDataBaseTables()
  }

  const onSelect = (newSelectedKeys: string[]) => {
    const selectedCode = scriptsList.value.find((item: any) => item.key === newSelectedKeys[0]).code
    pythonCode.value = selectedCode
  }
  fetchScriptsTable()
</script>
