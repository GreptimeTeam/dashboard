<template>
  <a-button type="primary" @click="runSqlCommand()">Run</a-button>
  <CodeMirror
    v-model="code"
    :placeholder="placeholder"
    :style="style"
    :spellcheck="spellcheck"
    :autofocus="autofocus"
    :indent-with-tab="indentWithTab"
    :tabSize="tabSize"
    :extensions="extensions"
    @change="codeChange"
  />
</template>

<script lang="ts" setup>
  import { Codemirror as CodeMirror } from 'vue-codemirror'
  import { oneDark } from '@codemirror/theme-one-dark'
  import { EditorView } from '@codemirror/view'
  import { sql } from '@codemirror/lang-sql'
  import useDataExplorer from '@/hooks/data-explorer'
  import { useDataBaseStore } from '@/store'

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

  const dataExplorer = useDataExplorer()
  const dataBaseStore = useDataBaseStore()
  const { initSqlResult, code, codeChange } = dataExplorer

  const refreshTableData = dataBaseStore.refreshDataBaseTables

  // extensions: Passed to CodeMirror EditorState.create({ extensions })
  const style = {
    height: '400px',
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

  async function runSqlCommand() {
    initSqlResult()
    refreshTableData()
  }
</script>
