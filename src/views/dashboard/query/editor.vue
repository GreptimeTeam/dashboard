<template lang="pug">
a-card.editor-card.editor-card--inset.gpt-query-editor-inset(:bordered="false")
  .editor-toolbar
    .editor-toolbar-main
      QueryToolbarRunButton(
        ref="runQueryBtnRef"
        abort-key="run-part"
        button-type="primary"
        button-class="run-query-btn query-run-btn--primary"
        :on-run="executePartQuery"
      )
        template(#icon)
          icon-play-arrow
        a-popover(position="bl" content-class="code-tooltip" :content="currentStatement")
          div {{ $t('dashboard.runQuery') + (queryType === 'sql' && currentQueryNumber ? ' #' + currentQueryNumber : '') }}
      a-button-group.explain-toolbar-group
        QueryToolbarRunButton(
          ref="explainBtnRef"
          abort-key="explain"
          button-type="outline"
          button-class="explain-query-btn query-run-btn--outline"
          :on-run="executeExplain"
        )
          template(#icon)
            svg.icon-16
              use(href="#explain")
          a-popover(position="bl" content-class="code-tooltip" :content="currentStatement")
            span {{ $t('dashboard.explainQuery') + `${currentQueryNumber ? ' #' + currentQueryNumber : ''} ` }}
        a-dropdown(position="bl")
          a-button(type="outline")
            template(#icon)
              icon-down
          template(#content)
            a-doption(@click="showImportExplainModal")
              template(#icon)
                icon-import
              | {{ $t('dashboard.importExplain') }}
      a-tooltip(
        v-if="queryType === 'sql'"
        position="br"
        content="Alt + Enter"
        mini
      )
        QueryToolbarRunButton(
          ref="runAllBtnRef"
          abort-key="run-all"
          button-type="outline"
          button-class="run-all-btn query-run-btn--outline"
          :on-run="executeRunAll"
        )
          template(#icon)
            icon-play-arrow-fill.run-all-play-icon
          | {{ $t('dashboard.runAll') }}
      a-form.prom-form(layout="inline" v-show="queryType === 'promql'" :model="promForm")
        a-space(:size="10")
          a-form-item(:hide-label="true")
            TimeSelect(
              v-model:time-length="promForm.time"
              v-model:time-range="promForm.range"
              flex-direction="row-reverse"
              button-size="medium"
              :relative-time-map="queryTimeMap"
              :relative-time-options="queryTimeOptions"
            )
          a-form-item(:hide-label="true")
            a-input(
              v-model="promForm.step"
              size="medium"
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
    .query-select
      a-select.query-type-select(v-model="queryType" :trigger-props="{ 'content-class': 'query-select' }")
        a-option(v-for="query of queryOptions" :="query")
      a-tooltip(
        v-if="queryType === 'sql'"
        mini
        position="left"
        :content="$t('dashboard.timeAssistance')"
      )
        a-button(type="outline" @click="openTimeAssistance")
          template(#icon)
            svg.icon-18
              use(href="#time")
      TimeAssistance(v-if="queryType === 'sql'" ref="tsRef" :cm="currentView")
      a-tooltip(mini :content="$t('dashboard.format')")
        a-button(type="outline" :disabled="isButtonDisabled" @click="formatSql()")
          template(#icon)
            svg.icon-18
              use(href="#code")
      a-tooltip(mini :content="$t('dashboard.clearCode')")
        a-button(type="outline" :disabled="isButtonDisabled" @click="clearCode")
          template(#icon)
            svg.icon-16
              use(href="#clear")
      a-tooltip(mini :content="focusMode ? $t('dashboard.exitFullSize') : $t('dashboard.fullSizeMode')")
        a-button(type="outline" @click="emit('toggle-focus-mode')")
          template(#icon)
            svg.icon-18
              use(v-if="!focusMode" href="#zoom")
              use(v-else href="#zoom-out")

a-resize-box.panel-resize(v-model:height="editorHeight" :directions="['bottom']" :style="editorResizeStyle")
  .editor-resize-content
    a-tabs.query-tabs(:default-active-key="'sql'" :active-key="queryType")
      a-tab-pane(key="sql")
        .full-width-height-editor.gpt-light-editor.query-editor-surface
          CodeMirror(
            v-model="codes.sql"
            :style="{ width: '100%', height: '100%' }"
            :spellcheck="spellcheck"
            :autofocus="autofocus"
            :indent-with-tab="indentWithTab"
            :tabSize="tabSize"
            :extensions="extensionsForSql"
            @ready="handleReadySql"
            @update="codeUpdate('sql')"
          )
      a-tab-pane(key="promql")
        .full-width-height-editor.gpt-light-editor.query-editor-surface
          CodeMirror(
            v-model="codes.promql"
            :style="{ width: '100%', height: '100%' }"
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
  import { sqlFormatter, parseSqlStatements, findStatementAtPosition, promqlFormatter } from '@/utils/sql'
  import { Message } from '@arco-design/web-vue'
  import QueryToolbarRunButton from '@/components/query-toolbar-run-button/index.vue'
  import { getExplainResultKeyCount } from '@/services/code-run'
  import { useQuerySession } from './use-query-session'

  import { durations, durationExamples, timeOptionsArray, queryTimeMap } from '../config'

  export interface Props {
    spellcheck?: boolean
    autofocus?: boolean
    indentWithTab?: boolean
    tabSize?: number
    focusMode?: boolean
  }
  const props = withDefaults(defineProps<Props>(), {
    spellcheck: true,
    autofocus: true,
    indentWithTab: true,
    tabSize: 2,
    focusMode: false,
  })

  const emit = defineEmits<{ 'toggle-focus-mode': [] }>()

  const editorHeight = useStorage('queryEditorHeight', 266)

  const editorResizeStyle = {
    'min-height': '120px',
    'max-height': '60vh',
  }

  const tsRef = ref<InstanceType<typeof import('./time-assistance.vue').default> | null>(null)

  const { codes, queryType, cursorAt, queryOptions, sqlView, promqlView, clearCode, runQuery, explainQuery } =
    useQueryCode()

  // Get current active CodeMirror view based on query type
  const currentView = computed(() => {
    return queryType.value === 'sql' ? sqlView.value : promqlView.value
  })

  const currentSqlPreview = ref('')
  const promForm = reactive<PromForm>({
    time: 5,
    step: '30s',
    range: [dayjs().subtract(5, 'minute').unix().toString(), dayjs().unix().toString()],
  })
  const { extensions } = storeToRefs(useDataBaseStore())
  const explainResultKeyCount = getExplainResultKeyCount()
  const session = useQuerySession()
  const importExplainForm = reactive({
    explainJson: '',
  })
  const currentQueryNumber = ref<number>(0)
  const currentStatement = ref<string>('')
  const importExplainModalVisible = ref(false)
  const runQueryBtnRef = ref<InstanceType<typeof QueryToolbarRunButton> | null>(null)
  const runAllBtnRef = ref<InstanceType<typeof QueryToolbarRunButton> | null>(null)
  const explainBtnRef = ref<InstanceType<typeof QueryToolbarRunButton> | null>(null)

  const openTimeAssistance = () => {
    if (queryType.value !== 'sql' || !tsRef.value) {
      return
    }
    tsRef.value.open()
  }
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

      session.appendExplainResult(newResult as any)

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

  const remeasureEditors = () => {
    nextTick(() => {
      requestAnimationFrame(() => {
        sqlView.value?.requestMeasure?.()
        promqlView.value?.requestMeasure?.()
      })
    })
  }

  watch(() => props.focusMode, remeasureEditors)

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

  const executeRunAll = async () => {
    const res = await runQuery(codes.value[queryType.value].trim(), queryType.value, false, promForm, 'run-all')
    if ((res as { cancelled?: boolean })?.cancelled) return
    if (res?.results?.length) session.appendResults(res.results)
    if (res?.log) session.appendLog(res.log)
  }

  const executePartQuery = async () => {
    const res = await runQuery(currentStatement.value, queryType.value, false, promForm, 'run-part')
    if ((res as { cancelled?: boolean })?.cancelled) return
    if (res?.results?.length) session.appendResults(res.results)
    if (res?.log) session.appendLog(res.log)
  }

  const formatSql = async () => {
    if (queryType.value === 'sql' && codes.value.sql.trim().length > 0) {
      codes.value.sql = sqlFormatter(codes.value.sql)
    } else if (queryType.value === 'promql' && codes.value.promql.trim().length > 0) {
      try {
        codes.value.promql = await promqlFormatter(codes.value.promql)
      } catch (error) {
        //
      }
    }
  }

  const executeExplain = async () => {
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
    if (result?.cancelled) return
    if (result?.results?.[0]) {
      session.appendExplainResult(result.results[0])
    }
  }

  window.addEventListener('beforeunload', () => {
    localStorage.setItem(
      'queryCode',
      JSON.stringify({
        sql: codes.value.sql,
        promql: codes.value.promql,
        type: queryType.value,
      })
    )
  })

  onMounted(() => {
    const stored = useStorage('queryCode', { sql: '', promql: '', type: 'sql' }).value
    codes.value.sql = stored.sql || ''
    codes.value.promql = stored.promql || ''
    queryType.value = stored.type || 'sql'
  })

  // Watch queryType changes and save to localStorage immediately
  watch(queryType, () => {
    localStorage.setItem(
      'queryCode',
      JSON.stringify({
        sql: codes.value.sql,
        promql: codes.value.promql,
        type: queryType.value,
      })
    )
  })

  // TODO: i18n config
  const queryTimeOptions = timeOptionsArray.map((value) => ({
    value,
    label: `Last ${value} minutes`,
  }))

  const myKeymap = keymap.of([
    {
      key: `Ctrl-Enter`,
      run: () => {
        runQueryBtnRef.value?.run()
        return true
      },
    },
    {
      key: 'Alt-Enter', // Run All
      run: () => {
        runAllBtnRef.value?.run()
        return true
      },
    },
    {
      key: 'Ctrl-Shift-;', // Time Assistant（Cmd/Ctrl+Shift+;）
      run: () => {
        openTimeAssistance()
        return true
      },
    },
    {
      key: 'Tab',
      run: acceptCompletion,
    },
  ])

  const extensionsForSql = [myKeymap, ...extensions.value.sql]
  const extensionsForPromql = [myKeymap, ...extensions.value.promql]
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
  .editor-card--inset.gpt-query-editor-inset {
    padding: 0 var(--gpt-page-padding-x);
  }

  .editor-toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 8px 0;
  }

  .editor-toolbar-main {
    display: flex;
    align-items: center;
    flex: 1;
    gap: 8px;
    min-width: 0;
    flex-wrap: nowrap;
  }

  .editor-toolbar-main :deep(.prom-form .arco-form-item) {
    margin-bottom: 0;
  }

  .editor-toolbar-main :deep(.prom-form .arco-space) {
    flex-wrap: nowrap;
  }

  .query-select {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-shrink: 0;
    margin-left: auto;
  }

  .query-type-select {
    width: 108px;
    flex-shrink: 0;
  }

  .query-type-select :deep(.arco-select-view-single) {
    width: 100%;
  }

  .editor-resize-content {
    box-sizing: border-box;
    height: 100%;
    padding: 0 var(--gpt-page-padding-x) var(--gpt-section-padding-y);
  }

  .explain-toolbar-group {
    display: inline-flex;
    align-items: center;
  }

  .explain-toolbar-group :deep(.arco-btn:last-child) {
    padding-left: 8px;
    padding-right: 8px;
  }

  :deep(.run-all-btn) .run-all-play-icon {
    color: var(--gpt-main-dark);
    font-size: var(--gpt-font-xl);
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
        }
      }
    }
  }

  .import-explain-modal {
    .arco-textarea {
      font-family: var(--font-mono);
      min-height: 400px;
    }
  }
</style>
