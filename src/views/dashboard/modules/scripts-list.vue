<template lang="pug">
a-space(direction="vertical" size="medium")
  a-space.search-space
    a-input(v-model="scriptsSearchKey" :allow-clear="true")
      template(#prefix)
        svg.icon
          use(href="#search")
    a-tooltip(mini :content="$t('dataExplorer.create')")
      .icon-space.pointer(@click="createNewScript()")
        svg.icon
          use(href="#create")
  a-scrollbar.tree-scrollbar
    a-tree.script-tree(
      ref="scriptsRef"
      v-model:selected-keys="scriptSelectedKeys"
      size="small"
      blockNode
      :data="scriptsListData"
      @select="onSelect"
    )
a-modal.change-modal(
  v-model:visible="modelVisible"
  :closable="false"
  :okButtonProps="okButton"
  :cancelButtonProps="cancelButton"
  @ok="handleOk"
  @cancel="handleCancel"
)
  template(#title="")
.
  {{$t('dataExplorer.question')}}
</template>

<script lang="ts" name="ScriptsList" setup>
  import { storeToRefs } from 'pinia'
  import { useDataBaseStore } from '@/store'
  import usePythonCode from '@/hooks/python-code'
  import useSiderTabs from '@/hooks/sider-tabs'

  const selectedNode = ref()
  const scriptsRef = ref()
  const tableSearchKey = ref('')
  const okButton = { type: 'text' }
  const cancelButton = { type: 'primary' }

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
  const { scriptsSearchKey, scriptsListData } = useSiderTabs()
  const { getScriptsTable } = useDataBaseStore()
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

  onMounted(() => {
    getScriptsTable()
  })
</script>
