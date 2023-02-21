<template lang="pug">
a-scrollbar.tree-scrollbar
  a-space.search-space
    a-input(v-model="tableSearchKey")
      template(#prefix)
        svg.icon
          use(href="#search")
    .icon-space
      svg.icon.pointer(@click="")
        use(href="#refresh")
  a-tree.script-tree(ref="scriptsRef" :data="scriptsList" size="small" @select="onSelect" blockNode v-model:selected-keys="scriptSelectedKeys")
a-modal(v-model:visible='modelVisible', @ok='handleOk', @cancel='handleCancel')
    template(#title='')
    .
      {{$t('dataExplorer.question')}}
</template>

<script lang="ts" name="ScriptsList" setup>
  import { storeToRefs } from 'pinia'
  import { useDataBaseStore } from '@/store'
  import usePythonCode from '@/hooks/python-code'

  const selectedNode = ref()
  const scriptsRef = ref()
  const tableSearchKey = ref('')

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
  const { getScriptsTable } = useDataBaseStore()
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

  const refreshScripts = () => {
    getScriptsTable()
  }

  if (!guideModal.value) {
    getScriptsTable()
  }
</script>
