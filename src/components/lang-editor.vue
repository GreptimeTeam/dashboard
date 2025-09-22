<template lang="pug">
a-card.light-editor-card(:bordered="false")
  CodeMirror(
    :placeholder="props.placeholder"
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

<script lang="ts" setup name="LangEditor">
  import { computed } from 'vue'
  import { Codemirror as CodeMirror } from 'vue-codemirror'
  import { basicSetup } from 'codemirror'
  import mapLanguages from '@/components/markdown-render/components/utils'

  const props = defineProps<{
    modelValue: string
    disabled?: boolean
    placeholder?: string
    language?: string
  }>()
  const emit = defineEmits<{
    (event: 'update:modelValue', value: string): void
  }>()

  const extensions = computed(() => {
    const baseExtensions = [basicSetup]
    const language = props.language || 'yaml'
    const languageExtension = mapLanguages(language)

    if (typeof languageExtension === 'function') {
      baseExtensions.push(languageExtension())
    } else {
      baseExtensions.push(languageExtension)
    }

    return baseExtensions
  })

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
  :deep(.arco-card-body) {
    height: 100%;
  }
  :deep(.cm-focused) {
    outline: none;
  }
</style>
