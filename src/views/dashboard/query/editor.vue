<template lang="pug">
a-card.editor-card(:bordered="false")
  a-space.space-between.pb-16
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
      a-select(v-model="queryType" :trigger-props="{ 'content-class': 'query-select' }" @change="selectCodeType")
        a-option(v-for="query of queryOptions" :="query")
  a-form.space-between.prom-form.mb-16(layout="inline" v-show="queryType === 'promql'" :model="promForm")
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
  import { Codemirror as CodeMirror } from 'vue-codemirror'
  import { oneDark } from '@codemirror/theme-one-dark'
  import { sql } from '@codemirror/lang-sql'
  import { PromQLExtension } from '@prometheus-io/codemirror-promql'
  import { useCodeRunStore } from '@/store'
  import { keymap } from '@codemirror/view'
  import type { KeyBinding } from '@codemirror/view'
  import { autocompletion } from '@codemirror/autocomplete'
  import type { TableTreeChild, TableTreeParent } from '@/store/modules/database/types'
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

  const route = useRoute()

  const { isCloud } = storeToRefs(useAppStore())
  const {
    codes,
    queryType,
    cursorAt,
    queryOptions,
    promForm,
    isButtonDisabled,
    primaryCodeRunning,
    secondaryCodeRunning,
    sqlView,
    promqlView,
    selectCodeType,
  } = useQueryCode()

  const lineStart = ref()
  const lineEnd = ref()
  const selectedCode = ref()
  const triggerVisible = ref(false)
  const rangePickerVisible = ref(false)

  const { runQuery } = useQueryCode()
  const { originTablesTree } = storeToRefs(useDataBaseStore())

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
    if (view) {
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
    await runQuery(codes.value[queryType.value].trim(), queryType.value)
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
    await runQuery(selectedCode.value.trim(), queryType.value)
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

  const hints = computed(() => {
    const schema: { [key: string]: string[] } = {}
    const initialMetricList = new Set<string>()
    originTablesTree.value.forEach((item: TableTreeParent) => {
      const columns = item.columns.map((child: TableTreeChild) => {
        initialMetricList.add(child.title)
        return child.title
      })
      schema[item.title] = columns
      initialMetricList.add(item.title)
    })

    return { sql: { schema }, promql: initialMetricList }
  })

  const extensions = {
    sql: [sql(hints.value.sql), oneDark, keymap.of(defaultKeymap as any), autocompletion({ closeOnBlur: false })],
    promql: [new PromQLExtension().asExtension(), oneDark, keymap.of(defaultKeymap as any)],
  }

  watch(hints, () => {
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

  onActivated(() => {
    selectCodeType()
  })
</script>

<style lang="less" scoped>
  .editor-card {
    width: 100%;
  }
</style>

<style lang="less">
  .query-tabs {
    > .arco-tabs-nav {
      height: 0;
    }
    > .arco-tabs-content {
      padding-top: 0;
    }
  }
</style>
