<template lang="pug">
.code-editor
  .code
    .operations(v-if="!disabled")
      a-button(@click="runSqlCommand") run
      a-button(@click="reset") reset
    CodeMirror(v-model="code" :extensions="extensions" :disabled="disabled")
  .results(v-if="result")
    a-tabs(default-active-key='1')
      a-tab-pane(key='1', title='Grid')
        DataGrid(:data="result")
      a-tab-pane(key='2', title='Chart')
        DataChart(:data="result")
  .logs(v-if="logs")
    a-list(:hoverable="true" size="small" :bordered="false" :split="false")
      Log(:log="logs" codeType="sql")
</template>

<script lang="ts" setup name="CodeEditor">
  import { Codemirror as CodeMirror } from 'vue-codemirror'
  import { oneDark } from '@codemirror/theme-one-dark'
  import { sql } from '@codemirror/lang-sql'
  // data
  const props = defineProps({
    disabled: {
      type: Boolean,
      default: false,
    },
  })
  const { fetchSQLResult } = useCodeRunStore()
  const slots = useSlots()
  const appStore = useAppStore()
  function codeFormat(code: any) {
    if (!code) return ''
    code = code?.[0]?.children[0]?.children
    const keys = Object.keys(appStore)
    keys.forEach((key) => {
      code = code.replace(new RegExp(`{{${key}}}`, 'g'), appStore[key])
    })
    return code
  }
  const defaultCode = codeFormat(slots?.default?.())
  const code = ref(defaultCode)
  const result = ref(null)
  const logs = ref(null)
  // methods
  const reset = () => {
    code.value = defaultCode
  }
  const runSqlCommand = async () => {
    // todo: add better format tool for code
    const res = await fetchSQLResult(code.value.trim().replace(/\n/gi, ' '))
    if (res.record) {
      result.value = res.record
    } else {
      console.log(`res.logs:`, res.logs)
      logs.value = res.logs
    }
    // todo: refresh tables data and when
  }
  // lifecycle
  const extensions = [sql(), oneDark]
</script>

<style lang="stylus" rel="stylesheet/stylus" scoped>
  .code-editor {
    margin-bottom 20px
    .code {
      display flex
      width 100%
      .operations {
        display flex
        flex-direction column
        margin-right 10px
        button {
          margin-bottom 10px
        }
      }
      :deep(.cm-editor) {
        width 100%
      }
    }
    .arco-code {
      margin-top 20px
    }
    .logs {
      margin-top 20px
    }
  }
</style>
