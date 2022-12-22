<template lang="pug">
a-card.editor-card
  a-space.button-space
    a-button(@click="runSqlCommand()" type="primary")
      | {{$t('dataExplorer.runAll')}}
    a(@click="runPartSqlCommand()")
      a-button(v-if="lineStart === lineEnd")
        | {{$t('dataExplorer.runLine')}} {{ lineStart }}
      a-button(v-else)
        | {{$t('dataExplorer.runLines')}} {{ lineStart }} - {{ lineEnd }}
  CodeMirror(v-model="code" :style="style" :spellcheck="spellcheck" :autofocus="autofocus" :indent-with-tab="indentWithTab" :tabSize="tabSize" :extensions="extensions" @ready="handleReady" @update="codeUpdate")
</template>

<script lang="ts" setup>
  import { Codemirror as CodeMirror } from 'vue-codemirror'
  import { oneDark } from '@codemirror/theme-one-dark'
  import { EditorView } from '@codemirror/view'
  import { sql } from '@codemirror/lang-sql'
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

  const lineStart = ref()
  const lineEnd = ref()
  const selectedCode = ref()
  const view = shallowRef()

  const dataExplorer = useDataExplorer()
  const dataBaseStore = useDataBaseStore()
  const codeRunStore = useCodeRunStore()
  const { code, cursorAt } = dataExplorer
  const { fetchSQLResult } = codeRunStore

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

  const extensions = [sql(), oneDark]

  // todo: combine next 2 functions
  const runSqlCommand = () => {
    // todo: add better format tool for code
    fetchSQLResult(code.value.trim().replace(/\n/gi, ' '))
    // todo: refresh tables data and when
  }

  const runPartSqlCommand = () => {
    fetchSQLResult(selectedCode.value.trim())
  }
</script>
