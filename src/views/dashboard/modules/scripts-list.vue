<template lang="pug">
a-spin(style="width: 100%" :loading="scriptsLoading")
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
      svg.icon.brand-color
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
    EmptyStatus(v-else)
a-modal.change-modal(
  v-model:visible="modelVisible"
  width="auto"
  :closable="false"
  :okButtonProps="okButton"
  :cancelButtonProps="cancelButton"
  @ok="handleOk"
  @cancel="handleCancel"
)
  template(#title="")
  a-space
    icon-exclamation-circle-fill.warning-color.icon-18
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
  const okButton = { type: 'outline' }
  const cancelButton = { type: 'primary' }
  const isRefreshing = ref(false)

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
    resetScript,
  } = usePythonCode()
  const { scriptsSearchKey, scriptsListData } = useSiderTabs()
  const { scriptsLoading } = storeToRefs(useDataBaseStore())
  const { getScriptsTable } = useDataBaseStore()

  const onSelect = (key: string[], selectedData: { node: object }) => {
    selectedNode.value = selectedData.node
    if (!isChanged.value) {
      overwriteCode(selectedData.node)
    } else {
      modelVisible.value = true
    }
  }
  const handleOk = () => {
    if (isRefreshing.value) {
      scriptsSearchKey.value = ''
      resetScript()
      getScriptsTable()
    } else if (creating.value) {
      pythonCode.value = ''
      lastSavedCode.value = ''
      createNewScript()
    } else {
      overwriteCode(selectedNode.value)
    }
    isRefreshing.value = false
  }

  const handleCancel = () => {
    scriptSelectedKeys.value = lastSelectedKey.value
    isRefreshing.value = false
  }

  const refreshScripts = () => {
    isRefreshing.value = true
    if (!isChanged.value) {
      scriptsSearchKey.value = ''
      resetScript()
      getScriptsTable()
      isRefreshing.value = false
    } else {
      modelVisible.value = true
    }
  }
</script>
