<template lang="pug">
a-card(:bordered="false").editor-card
  a-radio-group(v-model="codeType" :options="codeTypeOptions")
  a-space(v-if="codeType === 'sql'").button-space
    a-button(@click="runSqlCommand()" type="primary")
      | {{$t('dataExplorer.runAll')}}
    a(@click="runPartSqlCommand()")
      a-button(v-if="lineStart === lineEnd")
        | {{$t('dataExplorer.runLine')}} {{ lineStart }}
      a-button(v-else)
        | {{$t('dataExplorer.runLines')}} {{ lineStart }} - {{ lineEnd }}
  a-form.form(v-else :model="scriptForm" layout="inline")
    a-form-item(label="scriptName" )
      a-input(v-model:model-value="scriptForm.scriptName" placeholder="Please Input...") 
    a-space
      a-button(@click="insertScriptIntoDB()") Insert Script Into 'Scripts' Table
      a-button(@click="insertScriptIntoDB()") Insert and Run
  CodeMirror(v-model="code" :style="style" :spellcheck="spellcheck" :autofocus="autofocus" :indent-with-tab="indentWithTab" :tabSize="tabSize" :extensions="extensions" @ready="handleReady" @update="codeUpdate")
</template>

<script lang="ts" setup>
  import { Codemirror as CodeMirror } from 'vue-codemirror'
  import { oneDark } from '@codemirror/theme-one-dark'
  import { EditorView } from '@codemirror/view'
  import { sql } from '@codemirror/lang-sql'
  import { python } from '@codemirror/lang-python'
  import useDataExplorer from '@/hooks/data-explorer'

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
  const codeTypeOptions = [
    { label: 'sql', value: 'sql' },
    { label: 'python', value: 'python' },
  ]
  const scriptForm = ref({
    scriptName: '',
  })

  const lineStart = ref()
  const lineEnd = ref()
  const selectedCode = ref()
  const view = shallowRef()
  const codeType = ref('sql')
  const scriptName = ref('script')

  const dataExplorer = useDataExplorer()
  const dataBaseStore = useDataBaseStore()
  const codeRunStore = useCodeRunStore()
  const { code, cursorAt } = dataExplorer
  const { fetchSQLResult, insertScript } = codeRunStore

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

  const style = {
    height: '244px',
  }

  const extensions = [codeType.value === 'sql' ? sql() : python(), oneDark]

  // todo: combine next 2 functions
  const runSqlCommand = () => {
    // todo: add better format tool for code
    fetchSQLResult(code.value.trim().replace(/\n/gi, ' '))
    // todo: refresh tables data and when
  }

  const insertScriptIntoDB = () => {
    insertScript(scriptForm.value.scriptName, code.value.trim())
  }

  const runPartSqlCommand = () => {
    fetchSQLResult(selectedCode.value.trim())
  }
</script>
