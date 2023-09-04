<template lang="pug">
.code-editor.editor-card
  a-form.space-between.prom-form.mb-16(layout="inline" v-show="lang === 'promql'" :model="promForm")
    a-space(size="medium")
      a-form-item(:hide-label="true")
        TimeSelect(
          flex-direction="row-reverse"
          button-class="query-time-button"
          :trigger-visible="triggerVisible"
          :is-relative="promForm.isRelative === 1"
          :range-picker-visible="rangePickerVisible"
          :time-length="promForm.time"
          :time-range="promForm.range"
          :relative-time-map="queryTimeMap"
          :relative-time-options="queryTimeOptions"
          @open-time-select="openTimeSelect"
          @select-time-range="selectTimeRange"
          @select-time-length="selectTimeLength"
          @click-custom="clickCustom"
        )
      a-form-item(:hide-label="true")
        a-input(
          v-model="promForm.step"
          hide-button
          :style="{ width: '180px' }"
          :placeholder="$t('dashboard.step')"
        )
          template(#prefix)
            | Step
          template(#suffix)
            a-popover(trigger="hover")
              svg.icon
                use(href="#question")
              template(#content)
                a-list(size="small" :split="false" :bordered="false")
                  template(#header)
                    | {{ $t('dashboard.supportedDurations') }}
                  a-list-item(v-for="item of durations" :key="item")
                    a-typography-text(code) {{ item.key }}
                    span.ml-4 {{ item.value }}
                  a-list-item
                    span.ml-2 {{ $t('dashboard.examples') }}
                    a-typography-text(v-for="item of durationExamples" :key="item" code) {{ item }}
  .code
    .operations(v-if="!disabled")
      a-button(:disabled="runDisabled" :loading="isLoading" @click="runCommand") {{ $t('playground.run') }}
      a-button(v-if="showReset" @click="reset") {{ $t('playground.reset') }}
    CodeMirror(
      v-model="code"
      :extensions="[mapLanguages(lang)(), oneDark, keymap.of(defaultKeymap)]"
      :disabled="disabled"
    )
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
      Log(:codeType="lang" :log="log")
</template>

<script lang="ts" setup name="CodeEditor">
  import dayjs from 'dayjs'
  import { keymap } from '@codemirror/view'
  import { Codemirror as CodeMirror } from 'vue-codemirror'
  import { oneDark } from '@codemirror/theme-one-dark'
  import useDataChart from '@/hooks/data-chart'
  import type { ResultType } from '@/store/modules/code-run/types'
  import { durations, durationExamples, timeOptionsArray, queryTimeMap } from '@/views/dashboard/config'
  import mapLanguages from './utils'

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
    lang: {
      type: String,
      default: 'sql',
    },
  })
  const isLoading = ref(false)
  const { runQuery, promForm } = useQueryCode()
  const slots = useSlots()
  const appStore = useAppStore()
  const hasChart = ref(false)
  const hasRecords = ref(false)
  const chartForm = JSON.parse(props.defaultChartForm)
  const rangePickerVisible = ref(false)
  const triggerVisible = ref(false)

  function codeFormat(code: any) {
    if (!code) return ''
    code = code?.[0]?.children[0]?.children
    const keys = Object.keys(appStore)
    keys.forEach((key) => {
      code = code.replace(new RegExp(`{{${key}}}`, 'g'), appStore[key])
    })
    return code
  }

  let defaultCode = codeFormat(slots?.default?.())
  const code = ref(defaultCode)
  const result = ref({
    records: { rows: [], schema: { column_schemas: [] } },
    dimensionsAndXName: {
      dimensions: [],
      xAxis: '',
    },
    key: -1,
    type: '',
  } as ResultType)
  const log = ref('')
  // TODO: better reset
  const reset = () => {
    defaultCode = codeFormat(slots?.default?.())
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
    log.value = ''
    hasChart.value = false
    hasRecords.value = false
  }
  const runCommand = async () => {
    isLoading.value = true
    const res = await runQuery(code.value.trim(), props.lang, true)
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
    return code.value !== defaultCode
  })

  const runDisabled = computed(() => {
    return code.value.trim() === ''
  })

  const queryTimeOptions = timeOptionsArray.map((value) => ({
    value,
    label: `Last ${value} minutes`,
  }))

  const openTimeSelect = () => {
    rangePickerVisible.value = promForm.value.isRelative !== 1
    triggerVisible.value = true
  }

  const clickCustom = () => {
    rangePickerVisible.value = !rangePickerVisible.value
  }

  const selectTimeRange = (range: string[]) => {
    promForm.value.range = range
    promForm.value.time = -1
    promForm.value.isRelative = 0
    rangePickerVisible.value = false
    triggerVisible.value = false
  }

  const selectTimeLength = (value: number) => {
    promForm.value.time = value
    promForm.value.isRelative = 1
    rangePickerVisible.value = false
    triggerVisible.value = false
  }

  const defaultKeymap = [
    {
      key: 'alt-Enter',
      run: () => {
        runCommand()
      },
    },
  ]

  // lifecycle

  onBeforeUpdate(() => {
    if (codeFormat(slots?.default?.()) !== defaultCode) {
      reset()
    }
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
