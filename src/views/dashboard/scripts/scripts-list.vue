<template lang="pug">
a-scrollbar.tree-scrollbar
  a-tree.script-tree(:data="scriptsList" size="small" @select="onSelect" blockNode v-model:selected-keys="scriptSelectedKeys")
</template>

<script lang="ts" name="ScriptsList" setup>
  import { storeToRefs } from 'pinia'
  import { useDataBaseStore } from '@/store'
  import usePythonCode from '@/hooks/python-code'

  const dataBaseStore = useDataBaseStore()

  const { pythonCode, overwriteCode } = usePythonCode()
  const { fetchScriptsTable } = dataBaseStore
  const { scriptsList } = storeToRefs(dataBaseStore)

  const scriptSelectedKeys = ref([])

  const onSelect = (newSelectedKeys: string[]) => {
    const selectedScript = scriptsList.value.find((item: any) => item.key === newSelectedKeys[0])
    overwriteCode(selectedScript)
  }
  fetchScriptsTable()
</script>
