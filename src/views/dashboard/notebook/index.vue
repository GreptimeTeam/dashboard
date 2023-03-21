<template lang="pug">
.notebook
  a-layout.layout 
    a-layout-sider 
      a-tree.script-tree(
        :data="fileList" 
        :default-selected-keys="['0']"
        @select="onSelect"
        blockNode)
    a-layout-content
      MarkdownContainer(:fileName="currentFile")
</template>

<script lang="ts" setup name="Notebook">
  import MarkdownContainer from './markdown-container.vue'
  // data
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
</script>

<style lang="stylus" rel="stylesheet/stylus" scoped>
  .notebook
    max-height 100%
    overflow-y scroll
    .arco-layout-sider
      background-color #fff
      border-radius 10px
</style>
