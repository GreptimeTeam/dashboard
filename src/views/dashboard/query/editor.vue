<template lang="pug">
a-card.editor-card(:bordered="false")
  a-space.space-between.pb-15
    a-space(size="medium")
      a-button(type="primary" :disabled="isButtonDisabled" @click="runQueryAll()")
        .mr-4
          icon-loading(v-if="primaryCodeRunning" spin)
          icon-play-arrow(v-else)
        | {{ $t('dashboard.runAll') }}
      a-button(:disabled="isLineButtonDisabled" @click="runPartQuery()")
        .mr-4
          icon-loading(v-if="secondaryCodeRunning" spin)
          icon-play-arrow(v-else)
        div(v-if="lineStart === lineEnd") {{ $t('dashboard.runLine') }} {{ lineStart }}
        div(v-else) {{ $t('dashboard.runLines') }} {{ lineStart }} - {{ lineEnd }}
    .query-select
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
          :extensions="extensions.sql"
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
          :extensions="extensions.promql"
          @ready="handleReadyPromql"
          @update="codeUpdate('promql')"
        )
</template>

<script lang="ts" setup name="Editor">
  import dayjs from 'dayjs'
  import { Codemirror as CodeMirror } from 'vue-codemirror'
  import { oneDark } from '@codemirror/theme-one-dark'
  import { sql } from '@codemirror/lang-sql'
  import { PromQLExtension } from '@prometheus-io/codemirror-promql'
  import { keymap } from '@codemirror/view'
  import type { KeyBinding } from '@codemirror/view'
  import { autocompletion } from '@codemirror/autocomplete'
  import type { TableTreeChild, TableTreeParent } from '@/store/modules/database/types'
  import type { PromForm } from '@/store/modules/code-run/types'
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

  const { codes, queryType, cursorAt, queryOptions, primaryCodeRunning, secondaryCodeRunning, sqlView, promqlView } =
    useQueryCode()

  const lineStart = ref()
  const lineEnd = ref()
  const selectedCode = ref()
  const triggerVisible = ref(false)
  const rangePickerVisible = ref(false)
  const promForm = reactive<PromForm>({
    time: 5,
    step: '30s',
    range: [dayjs().subtract(5, 'minute').unix().toString(), dayjs().unix().toString()],
  })
  const { runQuery } = useQueryCode()
  const { hints } = storeToRefs(useDataBaseStore())

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
    if (primaryCodeRunning.value || secondaryCodeRunning.value) {
      return true
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

  // TODO: Try something better. CodeUpdate is constantly changing and the cost is too much.
  const codeUpdate = (type: string) => {
    const view = type === 'sql' ? sqlView.value : promqlView.value
    if (view && type === queryType.value) {
      const { state } = view
      const { ranges } = state.selection
      cursorAt.value = [ranges[0].from, ranges[0].to]
      lineStart.value = state.doc.lineAt(ranges[0].from).number
      lineEnd.value = state.doc.lineAt(ranges[0].to).number
      if (state.doc.text) {
        selectedCode.value = state.doc.text.slice(lineStart.value - 1, lineEnd.value).join(' ')
      } else {
        let tempCode: Array<string> = []
        state.doc.children.forEach((leaf: { text: [] }) => {
          tempCode = tempCode.concat(leaf.text)
        })
        selectedCode.value = tempCode.slice(lineStart.value - 1, lineEnd.value).join(' ')
      }
    }
  }

  const runQueryAll = async () => {
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
    secondaryCodeRunning.value = true
    await runQuery(selectedCode.value.trim(), queryType.value, false, promForm)
    secondaryCodeRunning.value = false
  }

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

  const extensions = {
    sql: [sql(hints.value.sql), oneDark, keymap.of(defaultKeymap as any), autocompletion({ closeOnBlur: false })],
    promql: [new PromQLExtension().asExtension(), oneDark, keymap.of(defaultKeymap as any)],
  }

  watch(hints.value, () => {
    extensions.sql = [sql(hints.value.sql), oneDark, keymap.of(defaultKeymap as any)]
    const promql = new PromQLExtension().setComplete({
      remote: {
        fetchFn: () => Promise.reject(),
        cache: {
          initialMetricList: [...hints.value.promql],
        },
      },
    })
    extensions.promql = [promql.asExtension(), oneDark, keymap.of(defaultKeymap as any)]
  })
</script>

<style lang="less" scoped>
  .editor-card {
    width: 100%;
    :deep(.ͼo) {
      height: 100%;
    }
  }

  .arco-resizebox {
    height: 260px;
  }
  :deep(.arco-resizebox-trigger-icon-wrapper) {
    color: var(--main-font-color);
    font-size: 18px;
    background-color: var(--th-bg-color);
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
</style>
