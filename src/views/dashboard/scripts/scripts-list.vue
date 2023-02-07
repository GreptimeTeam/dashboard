<template lang="pug">
a-scrollbar.tree-scrollbar
  a-tree.script-tree(:data="scriptsList" size="small" @select="onSelect" blockNode v-model:selected-keys="scriptSelectedKeys")
a-modal(v-model:visible='modelVisible', @ok='handleOk', @cancel='handleCancel')
    template(#title='')
    div
      | {{$t('dataExplorer.question')}}
</template>

<script lang="ts" name="ScriptsList" setup>
  import { storeToRefs } from 'pinia'
  import { useDataBaseStore } from '@/store'
  import usePythonCode from '@/hooks/python-code'

  const selectedNode = ref()

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
  const { fetchScriptsTable } = useDataBaseStore()
  const { scriptsList } = storeToRefs(useDataBaseStore())
  const { guideModal } = storeToRefs(useAppStore())
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

  if (!guideModal.value) {
    fetchScriptsTable()
  }
</script>
