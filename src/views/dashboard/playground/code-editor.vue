<template lang="pug">
.code-editor.editor-card
  .code
    .operations(v-if="!disabled")
      a-button(:disabled="runDisabled" :loading="isLoading" @click="runSqlCommand") {{ $t('playground.run') }}
      a-button(v-if="showReset" @click="reset") {{ $t('playground.reset') }}
    CodeMirror(v-model="code" :extensions="extensions" :disabled="disabled")
  .results(v-if="hasRecords")
    a-tabs.playground-tabs(:default-active-key="hasChart ? '2' : '1'")
      a-tab-pane(key="1" title="Table")
        DataGrid(:data="result" :hasHeader="false")
      a-tab-pane(v-if="hasChart" key="2" title="Chart")
        DataChart(:data="result" :hasHeader="false" :defaultChartForm="chartForm")
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
  import type { ResultType } from '@/store/modules/code-run/types'
  // data
  const props = defineProps({
    disabled: {
      type: Boolean,
      default: false,
    },
    defaultChartForm: {
      type: String,
      default: '{}',
    },
    type: {
      type: String,
      default: 'sql',
    },
  })
  const isLoading = ref(false)
  const { runQuery } = useQueryCode()
  const slots = useSlots()
  const appStore = useAppStore()
  const hasChart = ref(false)
  const hasRecords = ref(false)
  const chartForm = JSON.parse(props.defaultChartForm)

  function codeFormat(code: any) {
    if (!code) return ''
    code = code?.[0]?.children[0]?.children
    const keys = Object.keys(appStore)
    keys.forEach((key) => {
      code = code.replace(new RegExp(`{{${key}}}`, 'g'), appStore[key])
    })
    return code
  }

  const defaultCode = computed(() => codeFormat(slots?.default?.()))
  const code = ref(defaultCode.value)
  const result = ref({
    records: { rows: [], schema: { column_schemas: [] } },
    dimensionsAndXName: {
      dimensions: [],
      xAxis: '',
    },
    key: -1,
    type: '',
  } as ResultType)
  const log = ref()
  // TODO: better reset
  const reset = () => {
    code.value = defaultCode
    result.value = {
      records: { rows: [], schema: { column_schemas: [] } },
      dimensionsAndXName: {
        dimensions: [],
        xAxis: '',
      },
      key: -1,
      type: '',
    }
    log.value = null
    hasChart.value = false
    hasRecords.value = false
  }
  const runSqlCommand = async () => {
    isLoading.value = true
    const res = await runQuery(code.value.trim(), 'sql', true)
    if (res.lastResult?.records) {
      hasRecords.value = true
      result.value = res.lastResult
      hasChart.value = useDataChart(result.value).hasChart.value
    } else {
      hasRecords.value = false
    }
    // TODO: try something better
    log.value = res.log
    isLoading.value = false
    // todo: refresh tables data and when
  }

  const showReset = computed(() => {
    return code.value !== defaultCode.value
  })

  const runDisabled = computed(() => {
    return code.value.trim() === ''
  })
  const extensions = [sql(), oneDark]
  // lifecycle
  onBeforeUpdate(() => {
    console.log(`slo:`, defaultCode.value)
    code.value = codeFormat(slots?.default?.())
  })
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
