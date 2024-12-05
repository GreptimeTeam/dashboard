<template lang="pug">
CodeMirror(
  :modelValue="props.jsonStr"
  :extensions="extensions"
  :style="style"
  :spellcheck="true"
  :autofocus="true"
  :indent-with-tab="true"
  :tabSize="2"
  :disabled="true"
)
</template>

<script lang="ts" setup name="YMLEditor">
  import { Codemirror as CodeMirror } from 'vue-codemirror'
  import { basicSetup } from 'codemirror'

  import * as yamlMode from '@codemirror/legacy-modes/mode/yaml'
  import { StreamLanguage, LanguageSupport } from '@codemirror/language'
  import { json } from '@codemirror/lang-json'

  const props = defineProps(['jsonStr'])

  // TODO: markdown extension
  const extensions = [basicSetup, json()]

  const style = {
    height: '100%',
  }
</script>

<style lang="less" scoped>
  :deep(.arco-card.light-editor-card) {
    padding-right: 0;
  }
</style>
