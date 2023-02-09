<template lang="pug">
a-card.editor-card(:bordered="false")
  a-space.button-space
    a-space
      a-button(@click="runQuery()" type="primary")
        | {{ $t('dataExplorer.runAll') }}
      a(@click="runPartQuery()")
        a-button(v-if="lineStart === lineEnd")
          | {{ $t('dataExplorer.runLine') }} {{ lineStart }}
        a-button(v-else)
          | {{ $t('dataExplorer.runLines') }} {{ lineStart }} - {{ lineEnd }}
    a-select(v-model="queryType")
      a-option(v-for="item of queryOptions" :key="item.value" :value="item.value" :label="item.label")
  CodeMirror(v-model="queryCode[queryType]" :style="style" :spellcheck="spellcheck" :autofocus="autofocus" :indent-with-tab="indentWithTab" :tabSize="tabSize" :extensions="extensions" @ready="handleReady" @update="codeUpdate")
</template>

<script lang="ts" setup>
  import { Codemirror as CodeMirror } from 'vue-codemirror'
  import { oneDark } from '@codemirror/theme-one-dark'
  import { sql } from '@codemirror/lang-sql'
  import { PromQLExtension } from '@prometheus-io/codemirror-promql'
  import useDataExplorer from '@/hooks/data-explorer'

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

  const { queryCode, queryType, cursorAt, queryOptions } = useDataExplorer()
  const { getQueryResult } = useCodeRunStore()

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
    height: '244px',
  }
  const promQL = new PromQLExtension()

  const extensions = computed(() => {
    if (queryType.value === 'sql') {
      return [sql(), oneDark]
    }
    return [promQL.asExtension(), oneDark]
  })

  // todo: combine next 2 functions
  const runQuery = () => {
    // todo: add better format tool for code
    getQueryResult(queryCode.value[queryType.value].trim().replace(/\n/gi, ' '))
    // todo: refresh tables data and when
  }

  const runPartQuery = () => {
    getQueryResult(selectedCode.value.trim())
  }
</script>
