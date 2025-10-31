<template lang="pug">
.code-editor.editor-card
  a-form.space-between.prom-form.mb-15(layout="inline" v-show="lang === 'promql'" :model="promForm")
    a-space(size="medium")
      a-form-item(:hide-label="true")
        TimeSelect(
          v-model:time-length="promForm.time"
          v-model:time-range="promForm.range"
          button-class="query-time-button"
          :range-picker-visible="rangePickerVisible"
          :relative-time-map="queryTimeMap"
          :relative-time-options="queryTimeOptions"
        )
      a-form-item(:hide-label="true")
        a-input(
          v-model="promForm.step"
          hide-button
          :style="{ width: '180px' }"
          :placeholder="$t('dashboard.step')"
        )
          template(#prefix) Step
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
    a-button.copy(type="text" title="Copy Code" @click="copy")
      svg
        use(href="#copy-new")
  .results(v-if="hasRecords")
    a-tabs.playground-tabs(:default-active-key="hasChart ? '2' : '1'")
      a-tab-pane(key="1" title="Table")
        DataGrid(:data="result" :hasHeader="false")
      a-tab-pane(v-if="hasChart" key="2" title="Chart")
        DataChart(:data="result" :hasHeader="false" :defaultChartForm="chartParams ? JSON.parse(chartParams) : {}")
  .logs(v-if="log.type")
    a-list(
      size="small"
      :hoverable="true"
      :bordered="false"
      :split="false"
    )
      Log(:log="log" :has-action="false")
</template>

<script lang="ts" setup name="CodeEditor">
  import dayjs from 'dayjs'
  import { keymap } from '@codemirror/view'
  import { Codemirror as CodeMirror } from 'vue-codemirror'
  import { oneDark } from '@codemirror/theme-one-dark'
  import useDataChart from '@/hooks/data-chart'
  import type { PromForm, ResultType } from '@/store/modules/code-run/types'
  import type { Log } from '@/store/modules/log/types'
  import { durations, durationExamples, timeOptionsArray, queryTimeMap } from '@/views/dashboard/config'
  import i18n from '@/locale'
  import { Message } from '@arco-design/web-vue'
  import mapLanguages from './utils'

  // data
  const props = defineProps({
    disabled: {
      type: Boolean,
      default: false,
    },
    chartParams: {
      type: String,
      default: '{}',
    },
    promParams: {
      type: String,
      default: '{}',
    },
    lang: {
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
  const rangePickerVisible = ref(false)

  const promForm = reactive<PromForm>({
    time: 5,
    step: '30s',
    range: [dayjs().subtract(5, 'minute').unix().toString(), dayjs().unix().toString()],
  })

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
  const log = ref({} as Log)
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
    log.value = {} as Log
    hasChart.value = false
    hasRecords.value = false
    if (props.lang === 'promql') {
      const chartForm = JSON.parse(props.promParams)
      promForm.time = chartForm.time
      promForm.step = chartForm.step
      promForm.range = chartForm.range
    }
  }
  const runCommand = async () => {
    isLoading.value = true
    const res = await runQuery(code.value.trim(), props.lang, true, promForm)
    if (res.lastResult?.records) {
      hasRecords.value = true
      result.value = res.lastResult
      hasChart.value = useDataChart(result.value).hasChart.value
    } else {
      hasRecords.value = false
    }
    // TODO: try something better
    log.value = res.log || ({} as Log)
    isLoading.value = false
    // todo: refresh tables data and when
  }

  const copy = () => {
    navigator.clipboard.writeText(code.value)
    Message.success({
      content: i18n.global.t('copied'),
      duration: 2 * 1000,
    })
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
      position: relative;
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

    &:hover .copy {
      opacity: 1;
    }

    .copy {
      opacity: 0;
      position: absolute;
      width: 20px;
      height: 20px;
      min-width: 10px;
      padding: 0;
      right: 10px;
      top: 10px;
      z-index: 1;
      border-radius: 4px;
      cursor: pointer;
      transition: all 0.3s;
      background-color: var(--vp-c-black-mute);

      &:hover {
        background-color: var(--vp-c-black-mute);
      }

      svg {
        color: var(--vp-c-gray-light-2);
        width: 20px;
        height: 20px;

        &:hover {
          color: var(--vp-c-white-soft);
        }
      }
    }
  }

  :deep(.arco-list-content) {
    background: var(--main-bg-color);
  }

  :deep(.arco-list-item-action) {
    width: 32px;
    margin: 0;
    padding-left: 0;
  }

  :deep(.arco-list-item-main) {
    width: 100%;
  }

  :deep(.arco-list-small .arco-list-content-wrapper .arco-list-content > .arco-list-item) {
    padding: 10px 20px;
  }

  .arco-list-hover .arco-list-item:hover {
    background-color: inherit;
  }
</style>
