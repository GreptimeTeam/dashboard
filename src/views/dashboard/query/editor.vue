<template lang="pug">
a-card(:bordered="false").editor-card
  a-space(size="medium").button-space
    a-button(@click="runQuery()" type="primary")
      .mr-4
        icon-loading(spin v-if="primaryCodeRunning")
        icon-play-arrow(v-else)
      | {{$t('dataExplorer.runAll')}}
    a(@click="runPartQuery()")
      a-button
        .mr-4
          icon-loading(spin v-if="secondaryCodeRunning")
          icon-play-arrow(v-else)
        div(v-if="lineStart === lineEnd") {{$t('dataExplorer.runLine')}} {{ lineStart }}
        div(v-else) {{$t('dataExplorer.runLines')}} {{ lineStart }} - {{ lineEnd }}
    a-select(v-model="queryType" @change="selectCodeType")
      a-option(v-for="query of queryOptions" :="query")
  a-form.prom-form(:model="promForm" layout="inline" v-show="queryType !== 'sql'")
    a-form-item
      a-input-group
        a-select(v-if="promForm.isRelative === 1" v-model="promForm.time")
          a-option(v-for="time of timeOptions" :="time")
          template(#prefix)
            icon-calendar-clock
        a-range-picker(v-else v-model="promForm.range" format="YYYY-MM-DD HH:mm:ss" mode="date" :show-time="true" value-format="x")
          template(#prefix)
              icon-calendar-clock
        a-select(v-model="promForm.isRelative")
          a-option(label="Relative" :value="1")
          a-option(label="Absolute" :value="0")
    a-form-item(:label="$t('dataExplorer.step')")
      a-input(v-model="promForm.step" :allow-clear="true")
      . 
        {{ `s` }}
  CodeMirror(v-model="queryCode[queryType]" :style="style" :spellcheck="spellcheck" :autofocus="autofocus" :indent-with-tab="indentWithTab" :tabSize="tabSize" :extensions="extensions" @ready="handleReady" @update="codeUpdate")
</template>

<script lang="ts" setup>
  import { Codemirror as CodeMirror } from 'vue-codemirror'
  import { oneDark } from '@codemirror/theme-one-dark'
  import { sql } from '@codemirror/lang-sql'
  import { PromQLExtension } from '@prometheus-io/codemirror-promql'
  import { useCodeRunStore } from '@/store'
  import useQueryCode from '@/hooks/query-code'

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

  const lineStart = ref()
  const lineEnd = ref()
  const selectedCode = ref()
  const view = shallowRef()

  const { runCode } = useCodeRunStore()
  const { run: runSQL } = useQueryCode()

  const { primaryCodeRunning, secondaryCodeRunning } = storeToRefs(useCodeRunStore())
  const { queryCode, queryType, cursorAt, queryOptions, promForm, selectCodeType } = useQueryCode()

  const handleReady = (payload: any) => {
    view.value = payload.view
  }

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

  const style = {
    height: '250px',
  }
  const promQL = new PromQLExtension()

  const extensions = computed(() => {
    if (queryType.value === 'sql') {
      return [sql(), oneDark]
    }
    return [promQL.asExtension(), oneDark]
  })

  const runQuery = async () => {
    primaryCodeRunning.value = true
    // TODO: add better format tool for code
    await runSQL(queryCode.value.sql.trim().replace(/\n/gi, ' '))
    primaryCodeRunning.value = false
    // TODO: refresh tables data and when
  }

  const runPartQuery = () => {
    secondaryCodeRunning.value = true
    runCode(selectedCode.value.trim())
  }

  // TODO: i18n config
  const timeOptions = [5, 10, 15].map((value) => ({
    value,
    label: `Last ${value} minutes`,
    key: value,
  }))

  const timeTypes = ['relative', 'absolute'].map((value) => ({
    value,
    label: value,
    key: value,
  }))
</script>
