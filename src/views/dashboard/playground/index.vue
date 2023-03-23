<template lang="pug">
.notebook
  a-layout.layout 
    a-layout-sider 
      a-tree.script-tree(
        :data="fileList" 
        :default-selected-keys="['getting-started']"
        @select="onSelect"
        blockNode)
    a-layout-content
      .markdown-container
        MarkdownContent(v-if="MarkdownContent")
</template>

<script lang="ts" setup name="Notebook">
  import CodeEditor from './code-editor.vue'

  // data
  const MarkdownContent = shallowRef()
  const currentFile = ref('getting-started')
  const fileList = [
    {
      title: 'Getting Started',
      key: 'getting-started',
    },
    {
      title: 'Typing Master',
      key: 'typing-master',
    },
  ]
  // methods
  const onSelect = (e: string[]) => {
    ;[currentFile.value] = e
  }
  // lifecycle
  watchEffect(async () => {
    const { VueComponentWith } = await import(`./docs/${currentFile.value}.md`)
    MarkdownContent.value = VueComponentWith({ CodeEditor })
  })
</script>

<style lang="stylus" rel="stylesheet/stylus" scoped>
  .notebook
    max-height 100%
    overflow-y scroll
    .arco-layout-sider
      background-color #fff
      border-radius 10px
  .markdown-container
    background-color #fff
    border-radius 10px
    padding 10px 20px
</style>
