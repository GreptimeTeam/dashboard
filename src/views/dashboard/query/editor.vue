<template lang="pug">
a-card(:bordered="false").editor-card
  a-space(size="medium").button-space
    a-button(@click="runSqlCommand()" type="primary")
      | {{$t('dataExplorer.runAll')}}
    a(@click="runPartSqlCommand()")
      a-button(v-if="lineStart === lineEnd")
        | {{$t('dataExplorer.runLine')}} {{ lineStart }}
      a-button(v-else)
        | {{$t('dataExplorer.runLines')}} {{ lineStart }} - {{ lineEnd }}
  CodeMirror(v-model="sqlCode" :style="style" :spellcheck="spellcheck" :autofocus="autofocus" :indent-with-tab="indentWithTab" :tabSize="tabSize" :extensions="extensions" @ready="handleReady" @update="codeUpdate")
</template>

<script lang="ts" setup>
  import { Codemirror as CodeMirror } from 'vue-codemirror'
  import { oneDark } from '@codemirror/theme-one-dark'
  import { sql } from '@codemirror/lang-sql'
  import useDataExplorer from '@/hooks/data-explorer'
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

  const lineStart = ref()
  const lineEnd = ref()
  const selectedCode = ref()
  const view = shallowRef()

  const { fetchSQLResult, runCode } = useCodeRunStore()
  const { sqlCode, cursorAt } = useDataExplorer()

  const handleReady = (payload: any) => {
    view.value = payload.view
  }

  // TODO: Try something better. CodeUpdate is constantly changing and the cost is too much.
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

  const style = {
    height: '250px',
  }

  const extensions = [sql(), oneDark]

  // todo: combine next 2 functions
  const runSqlCommand = () => {
    // todo: add better format tool for code
    runCode(sqlCode.value.trim().replace(/\n/gi, ' '))
    // todo: refresh tables data and when
  }

  const runPartSqlCommand = () => {
    runCode(selectedCode.value.trim())
  }
</script>
