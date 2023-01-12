<template lang="pug">
a-scrollbar.tree-scrollbar
  a-tree.script-tree(:data="scriptsList" size="small" @select="onSelect" blockNode v-model:selected-keys="scriptSelectedKeys")
a-modal(v-model:visible='modelVisible', @ok='handleOk', @cancel='handleCancel')
    template(#title='')
    div
      | Your changes will be lost. Are you sure you want to continue?
</template>

<script lang="ts" name="ScriptsList" setup>
  import { storeToRefs } from 'pinia'
  import { useDataBaseStore } from '@/store'
  import usePythonCode from '@/hooks/python-code'
  import { Md5 } from 'ts-md5'

  const selectedNode = ref()

  const dataBaseStore = useDataBaseStore()

  const {
    pythonCode,
    creating,
    lastSavedCode,
    scriptSelectedKeys,
    lastSelectedKey,
    modelVisible,
    isChanged,
    overwriteCode,
    createNewScript,
  } = usePythonCode()
  const { fetchScriptsTable } = dataBaseStore
  const { scriptsList } = storeToRefs(dataBaseStore)

  const onSelect = (key: string[], selectedData: { node: object }) => {
    selectedNode.value = selectedData.node

    if (!isChanged.value) {
      overwriteCode(selectedData.node)
    } else {
      modelVisible.value = true
    }
  }
  const handleOk = () => {
    if (creating.value) {
      pythonCode.value = ''
      lastSavedCode.value = ''
      createNewScript()
    } else {
      overwriteCode(selectedNode.value)
    }
  }

  const handleCancel = () => {
    scriptSelectedKeys.value = lastSelectedKey.value
  }
  fetchScriptsTable()
</script>
