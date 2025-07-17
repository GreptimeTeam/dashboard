<template lang="pug">
a-card.editor-card(:bordered="false")
  a-space.space-between.pb-15
    a-space.editor-header(size="medium")
      a-dropdown-button(
        type="primary"
        position="bl"
        :disabled="isButtonDisabled || explainQueryRunning"
        @click="runPartQuery()"
      )
        a-popover(position="bl" content-class="code-tooltip" :content="currentStatement")
          a-space(:size="4")
            icon-loading(v-if="secondaryCodeRunning" spin)
            icon-play-arrow(v-else)
            div {{ $t('dashboard.runQuery') + (queryType === 'sql' && currentQueryNumber ? ' #' + currentQueryNumber : '') }}
            icon-close-circle-fill.icon-16(v-if="secondaryCodeRunning") 
        template(#icon)
          icon-down
        template(#content)
          a-doption(:disabled="secondaryCodeRunning" @click="exportCsv")
            template(#icon)
              svg.icon
                use(href="#export")
            a-popover(position="rt" content-class="code-tooltip" :content="currentStatement")
              span {{ $t('dashboard.exportCSV') }}
      a-dropdown-button(
        type="outline"
        position="bl"
        :disabled="explainQueryRunning"
        :class="{ 'explain-disabled': isButtonDisabled }"
        @click="explainCurrentStatement"
      )
        a-popover(
          position="bl"
          content-class="code-tooltip"
          :content="currentStatement"
          :disabled="isButtonDisabled"
        )
          a-space(:size="4")
            icon-loading(v-if="explainQueryRunning" spin)
            span {{ $t('dashboard.explainQuery') + `${currentQueryNumber ? ' #' + currentQueryNumber : ''} ` }}
            icon-close-circle-fill.icon-16(v-if="explainQueryRunning") 
        template(#icon)
          icon-down
        template(#content)
          a-doption(:disabled="explainQueryRunning" @click="showImportExplainModal")
            template(#icon)
              icon-import
            | {{ $t('dashboard.importExplain') }}
      a-button(
        v-if="queryType === 'sql'"
        type="outline"
        :disabled="isButtonDisabled"
        @click="runQueryAll()"
      )
        a-space(:size="4")
          icon-loading(v-if="primaryCodeRunning" spin)
          icon-play-arrow(v-else)
          | {{ $t('dashboard.runAll') }}
          icon-close-circle-fill.icon-16(v-if="primaryCodeRunning")
    .query-select
      a-space(size="medium")
        a-tooltip(v-if="queryType === 'sql'" mini :content="$t('dashboard.format')")
          a-button(type="outline" :disabled="isButtonDisabled" @click="formatSql")
            template(#icon)
              icon-code-block.icon-18
        a-tooltip(mini :content="$t('dashboard.clearCode')")
          a-button(type="outline" :disabled="isButtonDisabled" @click="clearCode")
            template(#icon)
              svg.icon-16
                use(href="#clear")
        a-select(v-model="queryType" :trigger-props="{ 'content-class': 'query-select' }")
          a-option(v-for="query of queryOptions" :="query")
  a-form.space-between.prom-form.mb-15(layout="inline" v-show="queryType === 'promql'" :model="promForm")
    a-space(:size="10")
      a-form-item(:hide-label="true")
        TimeSelect(
          v-model:time-length="promForm.time"
          v-model:time-range="promForm.range"
          flex-direction="row-reverse"
          button-class="query-time-button"
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
  a-resize-box(:directions="['bottom']")
    a-tabs.query-tabs(:default-active-key="'sql'" :active-key="queryType")
      a-tab-pane(key="sql")
        CodeMirror(
          v-model="codes.sql"
          :style="style"
          :spellcheck="spellcheck"
          :autofocus="autofocus"
          :indent-with-tab="indentWithTab"
          :tabSize="tabSize"
          :extensions="extensionsForSql"
          @ready="handleReadySql"
          @update="codeUpdate('sql')"
        )
      a-tab-pane(key="promql")
        CodeMirror(
          v-model="codes.promql"
          :style="style"
          :spellcheck="spellcheck"
          :autofocus="autofocus"
          :indent-with-tab="indentWithTab"
          :tabSize="tabSize"
          :extensions="extensionsForPromql"
          @ready="handleReadyPromql"
          @update="codeUpdate('promql')"
        )
  a-modal(
    v-model:visible="importExplainModalVisible"
    title="Import Explain Result JSON"
    modal-class="import-explain-modal"
    :width="800"
    @ok="handleImportExplain"
  )
    a-form(layout="vertical" :model="importExplainForm" :auto-label-width="true")
      a-form-item(field="explainJson" validate-trigger="blur")
        a-textarea(
          v-model="importExplainForm.explainJson"
          :placeholder="placeholder"
          :auto-size="{ minRows: 10, maxRows: 20 }"
          @paste="onPaste"
        )
</template>

<script lang="ts" setup name="Editor">
  import dayjs from 'dayjs'
  import { Codemirror as CodeMirror } from 'vue-codemirror'
  import { keymap } from '@codemirror/view'
  import { acceptCompletion } from '@codemirror/autocomplete'
  import type { PromForm } from '@/store/modules/code-run/types'
  import { useStorage } from '@vueuse/core'
  import { sqlFormatter, parseSqlStatements, findStatementAtPosition, debounce } from '@/utils/sql'
  import { Message } from '@arco-design/web-vue'
  import fileDownload from 'js-file-download'

  import { durations, durationExamples, timeOptionsArray, queryTimeMap } from '../config'

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

  const {
    codes,
    queryType,
    cursorAt,
    queryOptions,
    primaryCodeRunning,
    secondaryCodeRunning,
    sqlView,
    promqlView,
    clearCode,
  } = useQueryCode()

  const currentSqlPreview = ref('')
  const triggerVisible = ref(false)
  const rangePickerVisible = ref(false)
  const promForm = reactive<PromForm>({
    time: 5,
    step: '30s',
    range: [dayjs().subtract(5, 'minute').unix().toString(), dayjs().unix().toString()],
  })
  const { runQuery, explainQuery, exportWithFormat } = useQueryCode()
  const { extensions } = storeToRefs(useDataBaseStore())
  const { explainResultKeyCount, explainResult } = storeToRefs(useCodeRunStore())
  const importExplainForm = reactive({
    explainJson: '',
  })
  const currentQueryNumber = ref<number>(0)
  const currentStatement = ref<string>('')
  const importExplainModalVisible = ref(false)
  const explainQueryRunning = ref(false)

  const emit = defineEmits(['selectExplainTab'])

  // Show the import explain modal
  const showImportExplainModal = () => {
    importExplainModalVisible.value = true
  }

  // Handle importing explain data
  const handleImportExplain = async () => {
    try {
      // Parse the input JSON
      const jsonData = JSON.parse(importExplainForm.explainJson)
      // Check if it has the expected structure
      if (!jsonData.output || !jsonData.output[0]?.records) {
        throw new Error('Invalid explain result format. Expected "output" array with records.')
      }

      // Create a result object similar to what runCode would create
      const newResult = {
        records: jsonData.output[0].records,
        dimensionsAndXName: { dimensions: [], xAxis: '' },
        key: `explain - ${(explainResultKeyCount.value += 1)}`,
        type: queryType.value || 'sql',
        name: 'explain',
        executionTime: jsonData.execution_time_ms,
      }

      explainResult.value = newResult

      emit('selectExplainTab')

      // Clear the form and close the modal
      importExplainForm.explainJson = ''
      importExplainModalVisible.value = false

      Message.success('Explain result imported successfully')
    } catch (error) {
      Message.error(`Failed to parse explain result: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  const isButtonDisabled = computed(() => {
    if (codes.value[queryType.value].trim().length === 0) {
      return true
    }
    if (queryType.value === 'promql') {
      const hasRange = promForm.range ? promForm.range.length > 0 : false
      if (promForm.step.trim().length === 0 || (!promForm.time && !hasRange)) {
        return true
      }
    }
    return false
  })

  const handleReadySql = (payload: any) => {
    sqlView.value = payload.view
  }
  const handleReadyPromql = (payload: any) => {
    promqlView.value = payload.view
  }

  const style = {
    height: '250px',
  }

  const updateCurrentStatement = (sql: string, cursorPosition: number) => {
    if (!sql) {
      currentQueryNumber.value = 0
      currentStatement.value = ''
      return
    }

    if (queryType.value === 'promql') {
      currentQueryNumber.value = 0
      currentStatement.value = sql
      return
    }

    const statements = parseSqlStatements(sql)
    const result = findStatementAtPosition(statements, cursorPosition)

    if (result) {
      const { statement, index } = result
      currentQueryNumber.value = index + 1
      currentStatement.value = statement.text

      // Create a preview version (first few words) of the SQL statement
      const previewText = statement.text.replace(/\s+/g, ' ').substring(0, 25).trim()
      currentSqlPreview.value = previewText + (previewText.length < statement.text.length ? '...' : '')
    } else {
      currentQueryNumber.value = 0
      currentStatement.value = ''
      currentSqlPreview.value = 'dashboard.runSQL'
    }
  }

  const codeUpdate = (type: string) => {
    const view = type === 'sql' ? sqlView.value : promqlView.value
    if (view && type === queryType.value) {
      const { ranges } = view.state.selection
      cursorAt.value = [ranges[0].from, ranges[0].to]

      updateCurrentStatement(view.state.doc.toString(), ranges[0].from)
    }
  }

  const runQueryAll = async () => {
    if (primaryCodeRunning.value) {
      primaryCodeRunning.value = false
      secondaryCodeRunning.value = false
      return
    }
    primaryCodeRunning.value = true
    // TODO: add better format tool for code
    await runQuery(codes.value[queryType.value].trim(), queryType.value, false, promForm)
    primaryCodeRunning.value = false
    // TODO: refresh tables data and when
  }

  const isLineButtonDisabled = computed(() => {
    return currentQueryNumber.value === 0 || isButtonDisabled.value
  })

  const runPartQuery = async () => {
    if (secondaryCodeRunning.value) {
      primaryCodeRunning.value = false
      secondaryCodeRunning.value = false
      return
    }
    secondaryCodeRunning.value = true

    await runQuery(currentStatement.value, queryType.value, false, promForm)
    secondaryCodeRunning.value = false
  }

  const formatSql = () => {
    if (queryType.value === 'sql' && codes.value.sql.trim().length > 0) {
      codes.value.sql = sqlFormatter(codes.value.sql)
    }
  }

  const explainCurrentStatement = async () => {
    if (explainQueryRunning.value) {
      explainQueryRunning.value = false
      return
    }

    if (!isButtonDisabled.value) {
      explainQueryRunning.value = true
      try {
        const queryString = currentStatement.value || codes.value[queryType.value]
        let explainCommand = ''

        if (queryType.value === 'promql') {
          let start = promForm.range[0]
          let end = promForm.range[1]
          if (promForm.time) {
            const now = dayjs()
            end = now.unix().toString()
            start = now.subtract(promForm.time, 'minute').unix().toString()
          }
          const rangePrefix = `(${start}, ${end}, '${promForm.step}')`
          explainCommand = `tql analyze format json ${rangePrefix} ${queryString}`
        } else if (
          queryString.trim().toLowerCase().startsWith('tql eval') ||
          queryString.trim().toLowerCase().startsWith('tql evaluate')
        ) {
          const matches = queryString.match(/^tql\s+eval(?:uate)?\s+([\s\S]*)$/i)
          if (matches && matches[1]) {
            explainCommand = `tql analyze format json ${matches[1].trim()}`
          }
        } else {
          explainCommand = `explain analyze format json ${queryString}`
        }

        const result: any = await explainQuery(explainCommand, 'sql')
        if (result) {
          emit('selectExplainTab')
        }
      } finally {
        explainQueryRunning.value = false
      }
    }
  }

  const exportCsv = async () => {
    try {
      secondaryCodeRunning.value = true
      const res = await exportWithFormat(currentStatement.value, promForm, 'csvWithNames')
      fileDownload(res, `export_${queryType.value}_greptimedb.csv`)
      Message.success('Exported successfully')
    } catch (error) {
      console.log(error)
      Message.error(`Failed to export CSV`)
    } finally {
      secondaryCodeRunning.value = false
    }
  }

  window.addEventListener('beforeunload', () => {
    localStorage.setItem('queryCode', JSON.stringify(codes.value))
  })

  onMounted(() => {
    codes.value = useStorage('queryCode', { sql: '', promql: '' }).value
  })

  // TODO: i18n config
  const queryTimeOptions = timeOptionsArray.map((value) => ({
    value,
    label: `Last ${value} minutes`,
  }))

  // TODO: fix this
  const defaultKeymap = [
    {
      key: 'alt-Enter',
      run: () => {
        runQueryAll()
      },
    },
    {
      key: 'ctrl-Enter',
      run: () => {
        runPartQuery()
      },
    },
    {
      key: 'Tab',
      run: acceptCompletion,
    },
  ]

  const extensionsForSql = [...extensions.value.sql, keymap.of(defaultKeymap as any)]
  const extensionsForPromql = [...extensions.value.promql, keymap.of(defaultKeymap as any)]
  const placeholder = `Paste response from explain analyze format json here. Example format:
  {
    "output": [
      {
        "records": {
          "schema": {
            "column_schemas": []
          },
          "rows": [],
          "total_rows": 0
        }
      }
    ],
    "execution_time_ms": 0
  }`

  const onPaste = (event: ClipboardEvent) => {
    const { clipboardData } = event
    if (clipboardData) {
      const pastedText = clipboardData.getData('text/plain')
      importExplainForm.explainJson = pastedText
      try {
        const jsonData = JSON.parse(pastedText)
        if (jsonData.output && jsonData.output[0] && jsonData.output[0].records) {
          handleImportExplain()
        } else {
          Message.error('Invalid JSON format. Please ensure it matches the expected structure.')
        }
      } catch (error) {
        Message.error(`Failed to parse JSON: ${error instanceof Error ? error.message : String(error)}`)
      }
    }
  }
</script>

<style lang="less" scoped>
  .editor-card {
    width: 100%;
    .editor-header {
      padding-left: 8px;
    }
    :deep(.ͼo) {
      height: 100%;
    }
    .arco-btn {
      border-radius: 4px;
    }
    :deep(.arco-select-view-single) {
      border-radius: 4px;
    }
  }

  .arco-resizebox {
    height: 260px;
  }
  :deep(.arco-resizebox-trigger-icon-wrapper) {
    color: var(--main-font-color);
    font-size: 18px;
  }
  .prom-form {
    padding-left: 8px;
  }

  .explain-disabled {
    > :first-child {
      cursor: not-allowed;
    }
  }
</style>

<style lang="less">
  .query-tabs {
    height: 100%;
    > .arco-tabs-nav {
      height: 0;
    }
    > .arco-tabs-content {
      padding-top: 0;
      height: 100%;
      > .arco-tabs-content-list {
        height: 100%;
        .arco-tabs-pane {
          height: 100%;
          padding-left: 8px;
        }
      }
    }
  }

  .arco-btn-group .arco-btn-primary:not(:last-child) {
    border-right: 0.5px solid white;
  }

  .import-explain-modal {
    .arco-textarea {
      font-family: monospace;
      min-height: 400px;
    }
  }
</style>
