<template lang="pug">
.notebook
  a-layout.layout 
    a-layout-sider 
      a-tree.script-tree(
        :data="fileList" 
        :default-selected-keys="[currentFile]"
        @select="onSelect"
        blockNode)
    a-layout-content
      .markdown-container
        MarkdownContent(v-if="MarkdownContent")
</template>

<script lang="ts" setup name="Notebook">
  import CodeEditor from './code-editor.vue'
  import type {} from 'vite-plugin-markdown'
  // data
  const currentFile = ref('')
  const files = import.meta.glob('./docs/*.md', { eager: true })

  const fileList = Object.entries(files).map(([key, file]) => {
    const { attributes } = file as any
    return {
      title: attributes.title,
      key,
    }
  })
  currentFile.value = fileList[0].key

  const MarkdownContent = computed(() => {
    const { VueComponentWith } = files[currentFile.value] as any
    return VueComponentWith({ CodeEditor })
  })

  // methods
  const onSelect = (e: string[]) => {
    ;[currentFile.value] = e
  }
  // lifecycle
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
