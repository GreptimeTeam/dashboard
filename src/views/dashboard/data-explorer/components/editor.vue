<template>
  <a-button style="margin: 0 20px 5px 0" type="primary" @click="runSqlCommand()">Run All</a-button>
  <a @click="runPartSqlCommand()">
    <a-button v-if="lineStart === lineEnd" type="outline"> Run Line {{ lineStart }} </a-button>
    <a-button v-else type="outline"> Run Lines {{ lineStart }} - {{ lineEnd }}</a-button>
  </a>
  <a-button @click="clearCodeResult()"> clear result </a-button>

  <CodeMirror
    v-model="code"
    :placeholder="placeholder"
    :style="style"
    :spellcheck="spellcheck"
    :autofocus="autofocus"
    :indent-with-tab="indentWithTab"
    :tabSize="tabSize"
    :extensions="extensions"
    @ready="handleReady"
    @update="codeUpdate"
  />
</template>

<script lang="ts" setup>
  import { shallowRef, ref } from 'vue'
  import { storeToRefs } from 'pinia'
  import { Codemirror as CodeMirror } from 'vue-codemirror'
  import { oneDark } from '@codemirror/theme-one-dark'
  import { EditorView } from '@codemirror/view'
  import { sql } from '@codemirror/lang-sql'
  import useDataExplorer from '@/hooks/data-explorer'
  import { useDataBaseStore } from '@/store'
  import { useCodeRunStore } from '@/store'

  // <script setup> 范围里的值也能被直接作为自定义组件的标签名使用
  export interface Props {
    spellcheck?: boolean
    autofocus?: boolean
    indentWithTab?: boolean
    tabSize?: number
    placeholder?: string
  }
  // data
  // 响应式状态需要明确使用响应式 API 来创建
  // 和 setup() 函数的返回值一样，ref 在模板中使用的时候会自动解包
  const props = withDefaults(defineProps<Props>(), {
    spellcheck: true,
    autofocus: true,
    indentWithTab: true,
    tabSize: 2,
    placeholder: 'Code goes here...',
  })

  const lineStart = ref()
  const lineEnd = ref()
  const selectedCode = ref()
  const view = shallowRef()

  const dataExplorer = useDataExplorer()
  const dataBaseStore = useDataBaseStore()
  const { initSqlResult, code } = dataExplorer
  const codeRunStore = useCodeRunStore()
  // attention: must use storetorefs
  const { fetchSqlResult } = codeRunStore
  const { usedCode } = storeToRefs(codeRunStore)

  const handleReady = (payload: any) => {
    view.value = payload.view
  }
  const codeUpdate = () => {
    if (view.value) {
      const { state } = view.value
      const { ranges } = state.selection
      lineStart.value = state.doc.lineAt(ranges[0].from).number
      lineEnd.value = state.doc.lineAt(ranges[0].to).number
      selectedCode.value = state.doc.text.slice(lineStart.value - 1, lineEnd.value)
    }
  }

  const refreshTableData = dataBaseStore.refreshDataBaseTables

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

  const runSqlCommand = () => {
    initSqlResult()
    refreshTableData()
  }

  const runPartSqlCommand = () => {
    fetchSqlResult(selectedCode.value)
  }

  const clearCodeResult = () => {
    console.log(usedCode.value)
    codeRunStore.$reset()
  }
</script>
