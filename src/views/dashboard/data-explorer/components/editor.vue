<template lang="pug">
a-space(style="margin-bottom: 7px")
  a-button(type="primary" @click="runSqlCommand()")
    | Run All
  a(@click="runPartSqlCommand()")
    a-button(v-if="lineStart === lineEnd" type="outline")
      | Run Line {{ lineStart }}
    a-button(v-else type="outline")
      | Run Lines {{ lineStart }} - {{ lineEnd }}
  a-button(@click="clearCodeResult()")
    | Clear Result
CodeMirror(v-model="code" :placeholder="placeholder" :style="style" :spellcheck="spellcheck" :autofocus="autofocus" :indent-with-tab="indentWithTab" :tabSize="tabSize" :extensions="extensions" @ready="handleReady" @update="codeUpdate")
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
    placeholder?: string
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
  const { code } = dataExplorer
  // attention: must use storetorefs
  const { fetchSqlResult } = codeRunStore

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
    }
  }

  const refreshTableData = dataBaseStore.fetchDataBaseTables

  // extensions: Passed to CodeMirror EditorState.create({ extensions })
  const style = {
    height: '350px',
    // '.cm-gutters': {
    //   color: #254f9a,
    // },
  }
  // define our theme if needed in the future
  const myTheme = EditorView.theme(
    {
      // 输入的字体颜色
      '&': {
        color: '#0052D9',
        backgroundColor: '#FFFFFF',
      },
      '.cm-content': {
        caretColor: '#0052D9',
      },
      // 激活背景色
      '.cm-activeLine': {
        backgroundColor: '#FAFAFA',
      },
      // 激活序列的背景色
      '.cm-activeLineGutter': {
        backgroundColor: '#FAFAFA',
      },
      // 光标的颜色
      '&.cm-focused .cm-cursor': {
        borderLeftColor: '#0052D9',
      },
      // 选中的状态
      '&.cm-focused .cm-selectionBackground, ::selection': {
        backgroundColor: '#0052D9',
        color: '#FFFFFF',
      },
      // 左侧侧边栏的颜色
      '.cm-gutters': {
        backgroundColor: '#FFFFFF',
        color: '#ddd',
        border: 'none',
      },
    },
    { dark: true }
  )
  const extensions = [sql(), oneDark]

  // todo: combine next 2 functions
  const runSqlCommand = () => {
    // todo: add better format tool for code
    fetchSqlResult(code.value.trim().replace('\n', ' '))
    // todo: refresh tables data and when
  }

  const runPartSqlCommand = () => {
    fetchSqlResult(selectedCode.value.trim())
  }

  const clearCodeResult = () => {
    // todo: original state is just one tab?
    codeRunStore.$reset()
  }
</script>
