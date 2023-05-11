<template lang="pug">
a-card.editor-card(:bordered="false")
  a-space.space-between
    a-space(size="medium")
      a-button(type="primary" :disabled="isButtonDisabled" @click="runQueryAll()")
        .mr-4
          icon-loading(v-if="primaryCodeRunning" spin)
          icon-play-arrow(v-else)
        | {{ $t('dashboard.runAll') }}
      a-button(:disabled="isButtonDisabled" @click="runPartQuery()")
        .mr-4
          icon-loading(v-if="secondaryCodeRunning" spin)
          icon-play-arrow(v-else)
        div(v-if="lineStart === lineEnd") {{ $t('dashboard.runLine') }} {{ lineStart }}
        div(v-else) {{ $t('dashboard.runLines') }} {{ lineStart }} - {{ lineEnd }}
    .query-select(v-if="!isCloud")
      a-select(v-model="queryType" @change="selectCodeType")
        a-option(v-for="query of queryOptions" :="query")
  a-form.space-between.prom-form(layout="inline" v-show="queryType === 'promQL'" :model="promForm")
    a-space(size="medium")
      a-form-item(:hide-label="true")
        a-select(
          v-if="promForm.isRelative === 1"
          v-model="promForm.time"
          :trigger-props="{ 'update-at-scroll': true }"
        )
          a-option(v-for="time of timeOptions" :="time")
          template(#prefix)
            svg.icon-20
              use(href="#calendar")
        a-range-picker(
          v-else
          v-model="promForm.range"
          format="YYYY-MM-DD HH:mm:ss"
          value-format="X"
          :show-time="true"
          :allow-clear="true"
          :trigger-props="{ 'update-at-scroll': true }"
          :placeholder="[$t('dashboard.startTime'), $t('dashboard.endTime')]"
        )
          template(#prefix)
            svg.icon-20
              use(href="#calendar")
      a-form-item(:hide-label="true")
        a-input(
          v-model="promForm.step"
          hide-button
          :style="{ width: '180px' }"
          :placeholder="$t('dashboard.step')"
        )
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
    a-form-item.time-switch(:label="promForm.isRelative === 1 ? $t('dashboard.relative') : $t('dashboard.absolute')")
      a-switch(v-model="promForm.isRelative" :checked-value="1" :unchecked-value="0")
  CodeMirror(
    v-model="queryCode"
    :style="style"
    :spellcheck="spellcheck"
    :autofocus="autofocus"
    :indent-with-tab="indentWithTab"
    :tabSize="tabSize"
    :extensions="extensions[queryType]"
    @ready="handleReady"
    @update="codeUpdate"
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
  import { durations, durationExamples, timeOptionsArray } from '../config'

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
    queryCode,
    queryType,
    cursorAt,
    queryOptions,
    promForm,
    isButtonDisabled,
    primaryCodeRunning,
    secondaryCodeRunning,
    selectCodeType,
  } = useQueryCode()

  const lineStart = ref()
  const lineEnd = ref()
  const selectedCode = ref()
  const view = shallowRef()

  const { runQuery } = useQueryCode()

  const handleReady = (payload: any) => {
    view.value = payload.view
  }

  const style = {
    height: '250px',
  }

  const promQL = new PromQLExtension()

  // TODO: Try something better. CodeUpdate is constantly changing and the cost is too much.
  const codeUpdate = () => {
    if (view.value) {
      const { state } = view.value
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
    await runQuery(queryCode.value.trim().replace(/\n/gi, ' '), queryType.value)
    primaryCodeRunning.value = false
    // TODO: refresh tables data and when
  }

  const runPartQuery = async () => {
    secondaryCodeRunning.value = true
    await runQuery(selectedCode.value.trim(), queryType.value)
    secondaryCodeRunning.value = false
  }

  // TODO: i18n config
  const timeOptions = timeOptionsArray
    .map((value) => ({
      value,
      label: `Last ${value} minutes`,
    }))
    .concat([{ value: 0, label: 'Custom' }])

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
    sql: [sql(), oneDark, keymap.of(defaultKeymap as any)],
    promQL: [promQL.asExtension(), oneDark],
  }
</script>
