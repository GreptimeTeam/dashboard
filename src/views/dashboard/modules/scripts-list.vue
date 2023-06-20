<template lang="pug">
a-spin(:loading="scriptsLoading")
  a-space.search-space
    a-input.scripts-search-input(v-model="scriptsSearchKey" :allow-clear="true")
      template(#prefix)
        svg.icon
          use(href="#search")
    a-tooltip(mini :content="$t('dashboard.create')")
      .icon-space.pointer(@click="createNewScript()")
        svg.icon
          use(href="#create")
    .icon-space.pointer(@click="refreshScripts")
      svg.icon
        use(href="#refresh")
  a-scrollbar.tree-scrollbar
    a-tree.script-tree(
      v-if="scriptsListData && scriptsListData.length > 0"
      ref="scriptsRef"
      v-model:selected-keys="scriptSelectedKeys"
      size="small"
      blockNode
      :data="scriptsListData"
      @select="onSelect"
    )
    a-empty(v-else)
      template(#image)
        svg.icon-32
          use(href="#empty")
a-modal.change-modal(
  v-model:visible="modelVisible"
  :closable="false"
  :okButtonProps="okButton"
  :cancelButtonProps="cancelButton"
  @ok="handleOk"
  @cancel="handleCancel"
)
  template(#title="")
  | {{ $t('dashboard.question') }}
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
  const { scriptsLoading } = storeToRefs(useDataBaseStore())
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

  const refreshScripts = () => {
    scriptsSearchKey.value = ''
    getScriptsTable()
  }

  onMounted(() => {
    getScriptsTable()
  })
</script>
