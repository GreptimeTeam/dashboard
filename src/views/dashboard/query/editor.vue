<template lang="pug">
a-card.editor-card(:bordered="false")
  a-space.space-between.pb-15
    a-space.editor-header(size="medium")
      a-button(type="primary" :disabled="isButtonDisabled" @click="runQueryAll()")
        a-space(:size="4")
          icon-loading(v-if="primaryCodeRunning" spin)
          icon-play-arrow(v-else)
          | {{ $t('dashboard.runAll') }}
          icon-close-circle-fill.icon-16(v-if="primaryCodeRunning")
      a-tooltip(v-if="queryType === 'sql'" :content="selectedCode")
        a-button(type="outline" :disabled="isLineButtonDisabled" @click="runPartQuery()")
          a-space(:size="4")
            icon-loading(v-if="secondaryCodeRunning" spin)
            icon-play-arrow(v-else)
            div {{ $t('dashboard.runQuery') + ' #' + currentQueryNumber }}
            icon-close-circle-fill.icon-16(v-if="secondaryCodeRunning") 
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
          :extensions="[...extensions.sql, keymap.of(defaultKeymap)]"
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
          :extensions="[...extensions.promql, keymap.of(defaultKeymap)]"
          @ready="handleReadyPromql"
          @update="codeUpdate('promql')"
        )
</template>

<script lang="ts" setup name="Editor">
  import dayjs from 'dayjs'
  import { Codemirror as CodeMirror } from 'vue-codemirror'
  import { oneDark } from '@codemirror/theme-one-dark'
  import { keymap } from '@codemirror/view'
  import type { KeyBinding } from '@codemirror/view'
  import type { TableTreeChild, TableTreeParent } from '@/store/modules/database/types'
  import type { PromForm } from '@/store/modules/code-run/types'
  import { useStorage } from '@vueuse/core'
  import { sqlFormatter } from '@/utils'
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

  const lineStart = ref()
  const lineEnd = ref()
  const selectedCode = ref()
  const currentSqlPreview = ref('')
  const triggerVisible = ref(false)
  const rangePickerVisible = ref(false)
  const promForm = reactive<PromForm>({
    time: 5,
    step: '30s',
    range: [dayjs().subtract(5, 'minute').unix().toString(), dayjs().unix().toString()],
  })
  const { runQuery } = useQueryCode()
  const { extensions } = storeToRefs(useDataBaseStore())
  const currentQueryNumber = ref<number>(0)

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

  // Function to identify the complete SQL statement at cursor position
  const identifySqlStatement = (fullCode: string, cursorPosition: number) => {
    if (!fullCode || queryType.value !== 'sql') {
      currentQueryNumber.value = 0
      return
    }

    // Split the code by semicolons while preserving their positions
    const statements: { text: string; start: number; end: number }[] = []
    let currentStart = 0
    let inString = false
    let stringChar = ''

    for (let i = 0; i < fullCode.length; i += 1) {
      const char = fullCode[i]

      // Handle string literals to avoid detecting semicolons inside strings
      if ((char === "'" || char === '"') && (i === 0 || fullCode[i - 1] !== '\\')) {
        if (!inString) {
          inString = true
          stringChar = char
        } else if (char === stringChar) {
          inString = false
        }
      }

      // When we find a semicolon outside a string, we've found a statement boundary
      if (char === ';' && !inString) {
        statements.push({
          text: fullCode.substring(currentStart, i + 1).trim(),
          start: currentStart,
          end: i,
        })
        currentStart = i + 1
      }
    }

    // Add the last statement if it doesn't end with a semicolon
    if (currentStart < fullCode.length) {
      statements.push({
        text: fullCode.substring(currentStart).trim(),
        start: currentStart,
        end: fullCode.length - 1,
      })
    }

    // First check if cursor is exactly after a semicolon
    if (cursorPosition > 0 && fullCode[cursorPosition - 1] === ';') {
      // Find the statement that ends at this position
      for (let i = 0; i < statements.length; i += 1) {
        if (statements[i].end === cursorPosition - 1) {
          currentQueryNumber.value = i + 1
          const previewText = statements[i].text.replace(/\s+/g, ' ').substring(0, 25).trim()
          currentSqlPreview.value = previewText + (previewText.length < statements[i].text.length ? '...' : '')
          selectedCode.value = statements[i].text
          return
        }
      }
    }

    // Regular case - find which statement contains our cursor
    const currentStatement = statements.find((stmt) => cursorPosition >= stmt.start && cursorPosition <= stmt.end)

    if (currentStatement) {
      // Set the query number (1-based index)
      currentQueryNumber.value = statements.indexOf(currentStatement) + 1

      // Create a preview version (first few words) of the SQL statement
      const previewText = currentStatement.text.replace(/\s+/g, ' ').substring(0, 25).trim()

      currentSqlPreview.value = previewText + (previewText.length < currentStatement.text.length ? '...' : '')
      selectedCode.value = currentStatement.text
    } else {
      currentSqlPreview.value = 'dashboard.runSQL'
      currentQueryNumber.value = 0
    }
  }

  // TODO: Try something better. CodeUpdate is constantly changing and the cost is too much.
  const codeUpdate = (type: string) => {
    const view = type === 'sql' ? sqlView.value : promqlView.value
    if (view && type === queryType.value) {
      const { state } = view
      const { ranges } = state.selection
      cursorAt.value = [ranges[0].from, ranges[0].to]
      lineStart.value = state.doc.lineAt(ranges[0].from).number
      lineEnd.value = state.doc.lineAt(ranges[0].to).number

      // Extract code
      let tempCode: Array<string> = []
      if (state.doc.text) {
        tempCode = state.doc.text.slice(lineStart.value - 1, lineEnd.value)
        selectedCode.value = tempCode.join('\n')
      } else {
        state.doc.children.forEach((leaf: { text: [] }) => {
          tempCode = tempCode.concat(leaf.text)
        })
        selectedCode.value = tempCode.slice(lineStart.value - 1, lineEnd.value).join('\n')
      }

      // If SQL, identify the complete statement that contains the current selection
      if (type === 'sql') {
        identifySqlStatement(state.doc.toString(), ranges[0].from)
      }
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
    if (!selectedCode.value || selectedCode.value.trim().length === 0) {
      return true
    }
    return isButtonDisabled.value
  })

  const runPartQuery = async () => {
    if (secondaryCodeRunning.value) {
      primaryCodeRunning.value = false
      secondaryCodeRunning.value = false
      return
    }
    secondaryCodeRunning.value = true

    // Use the selected statement for SQL, otherwise use the selected lines
    const codeToRun =
      queryType.value === 'sql' && selectedCode.value.trim().includes(';')
        ? selectedCode.value.trim()
        : selectedCode.value.trim()

    await runQuery(codeToRun, queryType.value, false, promForm)
    secondaryCodeRunning.value = false
  }

  const formatSql = () => {
    if (queryType.value === 'sql' && codes.value.sql.trim().length > 0) {
      codes.value.sql = sqlFormatter(codes.value.sql)
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
  ]
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
</style>
