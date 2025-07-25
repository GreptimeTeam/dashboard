<template lang="pug">
a-card.light-editor-card(:bordered="false")
  CodeMirror(
    :modelValue="props.modelValue"
    :extensions="extensions"
    :style="style"
    :spellcheck="true"
    :autofocus="true"
    :indent-with-tab="true"
    :tabSize="2"
    :disabled="disabled"
    @change="codeUpdate"
  )
</template>

<script lang="ts" setup name="YMLEditorSimple">
  import { Codemirror as CodeMirror } from 'vue-codemirror'
  import { basicSetup } from 'codemirror'

  import * as yamlMode from '@codemirror/legacy-modes/mode/yaml'
  import { StreamLanguage, LanguageSupport } from '@codemirror/language'

  const props = defineProps<{
    modelValue: string
    disabled?: boolean
  }>()
  const emit = defineEmits<{
    (event: 'update:modelValue', value: string): void
  }>()

  const yaml = new LanguageSupport(StreamLanguage.define(yamlMode.yaml))

  // TODO: markdown extension
  const extensions = [basicSetup, yaml]
  const codeUpdate = (content) => {
    emit('update:modelValue', content)
  }

  const style = {
    height: '100%',
  }
</script>

<style lang="less" scoped>
  :deep(.arco-card.light-editor-card) {
    padding-right: 0;
  }
</style>
