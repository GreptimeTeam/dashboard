<template lang="pug">
a-card(:bordered="false").editor-card
  a-form.form(:model="scriptForm" layout="inline")
    a-form-item(label="scriptName" )
      a-input(v-model:model-value="scriptForm.scriptName" placeholder="Please Input..." v-bind:disabled="!ifNewScript") 
    a-space
      a-button(@click="saveCurrentScript()") Save Script
      a-button(@click="saveScriptAndRun()") Save and Run
  CodeMirror(v-model="pythonCode" :style="style" :spellcheck="spellcheck" :autofocus="autofocus" :indent-with-tab="indentWithTab" :tabSize="tabSize" :extensions="extensions" @ready="handleReady" @update="codeUpdate")
</template>

<script lang="ts" name="PyEditor" setup>
  import { Codemirror as CodeMirror } from 'vue-codemirror'
  import { oneDark } from '@codemirror/theme-one-dark'
  import { EditorView } from '@codemirror/view'
  import { python } from '@codemirror/lang-python'
  import usePythonCode from '@/hooks/python-code'
  import { useCodeRunStore } from '@/store'

  export interface Props {
    spellcheck?: boolean
    autofocus?: boolean
    indentWithTab?: boolean
    tabSize?: number
  }
  const props = withDefaults(defineProps<Props>(), {
    spellcheck: true,
    autofocus: true,
    indentWithTab: true,
    tabSize: 2,
  })

  const dataBaseStore = useDataBaseStore()
  const { pythonCode, cursorAt, ifNewScript, scriptName } = usePythonCode()
  const { saveScript, runScript } = useCodeRunStore()
  const { fetchScriptsTable } = dataBaseStore

  const lineStart = ref()
  const lineEnd = ref()
  const selectedCode = ref()
  const view = shallowRef()

  const scriptForm = ref({
    scriptName,
  })

  const handleReady = (payload: any) => {
    view.value = payload.view
  }
  const codeUpdate = () => {
    if (view.value) {
      const { state } = view.value
      const { ranges } = state.selection
      lineStart.value = state.doc.lineAt(ranges[0].from).number
      lineEnd.value = state.doc.lineAt(ranges[0].to).number
      selectedCode.value = state.doc.text.slice(lineStart.value - 1, lineEnd.value).join(' ')
      cursorAt.value = [ranges[0].from, ranges[0].to]
    }
  }

  const refreshTableData = dataBaseStore.fetchDataBaseTables

  // extensions: Passed to CodeMirror EditorState.create({ extensions })
  const style = {
    height: '244px',
  }

  const extensions = [python(), oneDark]

  const saveCurrentScript = async () => {
    await saveScript(scriptForm.value.scriptName, pythonCode.value.trim())
    fetchScriptsTable()
  }
  const saveScriptAndRun = async () => {
    await saveScript(scriptForm.value.scriptName, pythonCode.value.trim())
    runScript(scriptForm.value.scriptName)
    fetchScriptsTable()
  }
</script>
