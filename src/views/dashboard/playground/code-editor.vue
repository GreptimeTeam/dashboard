<template lang="pug">
.code-editor
  .code
    .operations(v-if="!disabled")
      a-button(@click="runSqlCommand" :loading="isLoading") {{ $t('playground.run') }}
      a-button(@click="reset") {{ $t('playground.reset') }}
    CodeMirror(v-model="code" :extensions="extensions" :disabled="disabled")
  .results(v-if="result")
    a-tabs(default-active-key='1')
      a-tab-pane(key='1', title='Grid')
        DataGrid(:data="result")
      a-tab-pane(key='2', title='Chart')
        DataChart(:data="result")
  .logs(v-if="log")
    a-list.log-list(:hoverable="true" size="small" :bordered="false" :split="false")
      Log(:log="log" codeType="sql")
</template>

<script lang="ts" setup name="CodeEditor">
  import { Codemirror as CodeMirror } from 'vue-codemirror'
  import { oneDark } from '@codemirror/theme-one-dark'
  import { sql } from '@codemirror/lang-sql'
  import Log from '@/views/dashboard/modules/log.vue'
  // data
  const props = defineProps({
    disabled: {
      type: Boolean,
      default: false,
    },
  })
  const isLoading = ref(false)
  const { run } = useQueryCode()
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
  const result = ref()
  const log = ref()
  // methods
  const reset = () => {
    code.value = defaultCode
    result.value = null
    log.value = null
  }
  const runSqlCommand = async () => {
    isLoading.value = true
    const res = await run(code.value.trim().replace(/\n/gi, ' '), 'sql', true)
    if (res.record) {
      result.value = res.record
    } else {
      log.value = res.log
    }
    isLoading.value = false
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
    :deep(.arco-btn) {
      min-width 80px
    }
  }
</style>
