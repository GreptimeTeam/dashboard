<template lang="pug">
a-card.editor-card.padding-16(:bordered="false")
  a-space.form-space(size="medium")
    a-form(layout="inline" :model="scriptForm")
      a-form-item(:label="$t('dashboard.scriptName')")
        a-input(
          v-model:model-value="scriptForm.scriptName"
          v-bind:disabled="!isNewScript"
          :placeholder="$t('dashboard.input')"
        ) 
    a-space
      a-button(v-if="ifCanRun" :disabled="isButtonDisabled" @click="runScript()")
        .mr-4
          icon-loading(v-if="scriptRunning" spin)
          icon-play-arrow(v-else)
        | {{ $t('dashboard.runScriptAction') }}
      a-space(v-else)
        a-button(:disabled="isButtonDisabled" @click="saveCurrentScript()")
          .mr-4
            icon-loading(v-if="scriptSaving" spin)
            icon-play-arrow(v-else)
          | {{ $t('dashboard.saveScript') }}
        a-button(:disabled="isButtonDisabled" @click="saveScriptAndRun()")
          .mr-4
            icon-loading(v-if="scriptRunning" spin)
            icon-play-arrow(v-else)
          | {{ $t('dashboard.saveAndRun') }}
  CodeMirror(
    v-model="pythonCode"
    :style="style"
    :spellcheck="spellcheck"
    :autofocus="autofocus"
    :indent-with-tab="indentWithTab"
    :tabSize="tabSize"
    :extensions="extensions"
    @ready="handleReady"
    @update="codeUpdate"
  )
</template>

<script lang="ts" name="PyEditor" setup>
  import { Codemirror as CodeMirror } from 'vue-codemirror'
  import { oneDark } from '@codemirror/theme-one-dark'
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

  const route = useRoute()
  const dataBaseStore = useDataBaseStore()
  const {
    pythonCode,
    cursorAt,
    lastSavedCode,
    isNewScript,
    scriptName,
    isChanged,
    isButtonDisabled,
    scriptSaving,
    scriptRunning,
    selectAfterSave,
    createNewScript,
  } = usePythonCode()
  const { save: saveScript } = usePythonCode()
  const { runQuery } = useQueryCode()
  const { getScriptsTable } = dataBaseStore

  const codeType = 'python'
  const lineStart = ref()
  const lineEnd = ref()
  const selectedCode = ref()
  const view = shallowRef()

  const scriptForm = ref({
    scriptName,
  })

  const ifCanRun = computed(() => {
    if (!isChanged.value && pythonCode.value !== '' && scriptForm.value.scriptName) {
      return true
    }
    return false
  })
  const handleReady = (payload: any) => {
    view.value = payload.view
  }
  const codeUpdate = () => {
    if (view.value) {
      const { state } = view.value
      const { ranges } = state.selection
      cursorAt.value = [ranges[0].from, ranges[0].to]
      lineStart.value = state.doc.lineAt(ranges[0].from).number
      lineEnd.value = state.doc.lineAt(ranges[0].to).number
      if (state.doc.text) {
        selectedCode.value = state.doc.text.slice(lineStart.value - 1, lineEnd.value).join(' ')
      } else {
        let tempCode: Array<string> = []
        state.doc.children.forEach((leaf: { text: [] }) => {
          tempCode = tempCode.concat(leaf.text)
        })
        selectedCode.value = tempCode.slice(lineStart.value - 1, lineEnd.value).join(' ')
      }
    }
  }

  const refreshTableData = dataBaseStore.getTables

  // extensions: Passed to CodeMirror EditorState.create({ extensions })
  const style = {
    height: '250px',
  }

  const extensions = [python(), oneDark]
  const saveCurrentScript = async () => {
    const routeName = route.name as string
    try {
      scriptSaving.value = true
      await saveScript(scriptForm.value.scriptName, pythonCode.value.trim())
      await getScriptsTable()
      selectAfterSave(scriptForm.value.scriptName)
    } catch (error: any) {
      // error
    }
    scriptSaving.value = false
  }
  const saveScriptAndRun = async () => {
    const routeName = route.name as string
    try {
      scriptRunning.value = true
      await saveScript(scriptForm.value.scriptName, pythonCode.value.trim())
      lastSavedCode.value = pythonCode.value
      await runQuery(scriptForm.value.scriptName, codeType)
      await getScriptsTable()
      selectAfterSave(scriptForm.value.scriptName)
    } catch (error) {
      // error
    }
    scriptRunning.value = false
  }

  const runScript = async () => {
    const routeName = route.name as string
    scriptRunning.value = true
    await runQuery(scriptForm.value.scriptName, codeType)
    scriptRunning.value = false
  }
</script>
