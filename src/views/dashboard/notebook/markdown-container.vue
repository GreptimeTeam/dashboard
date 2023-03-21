<template lang="pug">
.markdown-container
  MarkdownContent(v-if="MarkdownContent")
</template>

<script lang="ts" setup name="MarkdownContainer">
  import CodeEditor from './code-editor.vue'

  const props = defineProps({
    fileName: {
      type: String,
      default: 'getting-start',
    },
  })

  const MarkdownContent = shallowRef()

  watchEffect(async () => {
    const { VueComponentWith, markdown } = await import(`./docs/${props?.fileName}.md`)
    MarkdownContent.value = VueComponentWith({ CodeEditor })
    console.log(`markdown:`, MarkdownContent.value)
  })

  // data
  // methods

  // lifecycle
</script>

<style lang="stylus" rel="stylesheet/stylus" scoped>
  .markdown-container {
    background-color #fff
    border-radius 10px
    padding 10px 20px
  }
</style>
