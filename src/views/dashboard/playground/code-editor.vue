<template lang="pug">
.code-editor
  .code
    .operations(v-if="!disabled")
      a-button(:loading="isLoading" @click="runSqlCommand") {{ $t('playground.run') }}
      a-button(@click="reset") {{ $t('playground.reset') }}
    CodeMirror(v-model="code" :extensions="extensions" :disabled="disabled")
  .results(v-if="result")
    a-tabs.playground-tabs(default-active-key="1")
      a-tab-pane(v-if="hasGrid" key="1" title="Table")
        DataGrid(:data="result" :hasHeader="false")
      a-tab-pane(v-if="hasChart" key="2" title="Chart")
        DataChart(:data="result" :hasHeader="false")
  .logs(v-if="log")
    a-list.log-list(
      size="small"
      :hoverable="true"
      :bordered="false"
      :split="false"
    )
      Log(codeType="sql" :log="log")
</template>

<script lang="ts" setup name="CodeEditor">
  import { Codemirror as CodeMirror } from 'vue-codemirror'
  import { oneDark } from '@codemirror/theme-one-dark'
  import { sql } from '@codemirror/lang-sql'
  import useDataChart from '@/hooks/data-chart'
  // data
  const props = defineProps({
    disabled: {
      type: Boolean,
      default: false,
    },
  })
  const isLoading = ref(false)
  const { runQuery } = useQueryCode()
  const slots = useSlots()
  const appStore = useAppStore()
  const hasChart = ref()
  const hasGrid = ref()
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
    const res = await runQuery(code.value.trim().replace(/\n/gi, ' '), 'sql', true)
    const { hasChart: _hasChart, hasGrid: _hasGrid } = useDataChart(result.value)
    // TODO: try something better
    result.value = res.record
    log.value = res.log
    hasChart.value = res.record && _hasChart.value
    hasGrid.value = _hasGrid.value
    isLoading.value = false
    // todo: refresh tables data and when
  }
  // lifecycle
  const extensions = [sql(), oneDark]
</script>

<style lang="stylus" rel="stylesheet/stylus" scoped>
  .code-editor {
    margin-bottom: 20px;

    .code {
      display: flex;
      width: 100%;

      .operations {
        display: flex;
        flex-direction: column;
        margin-right: 10px;

        button {
          margin-bottom: 10px;
        }
      }

      :deep(.cm-editor) {
        width: 100%;
      }
    }

    .arco-code {
      margin-top: 20px;
    }

    .logs {
      margin-top: 20px;
    }

    :deep(.arco-btn) {
      min-width: 80px;
    }
  }
</style>
