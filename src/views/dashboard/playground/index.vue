<template lang="pug">
.playground
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
RefreshPlaygroundModal(ref="refreshPlaygroundModal")
</template>

<script lang="ts" setup name="Playground">
  import { getPlaygroundInfo } from '@/api/playground'
  import CodeEditor from './code-editor.vue'

  // data
  const { VITE_RECAPTCHA_SITE_KEY } = import.meta.env
  const { isCloud } = storeToRefs(useAppStore())
  const appStore = useAppStore()
  const refreshPlaygroundModal = ref()
  const currentFile = ref('')
  const files = import.meta.glob('./docs/*.md', { eager: true })

  const fileList =
    Object.entries(files).map(([key, file]) => {
      const { attributes } = file as any
      return {
        title: attributes.title,
        key,
      }
    }) || []
  currentFile.value = fileList[0]?.key

  const MarkdownContent = computed(() => {
    const { VueComponentWith } = files[currentFile.value] as any
    return VueComponentWith({ CodeEditor })
  })

  // methods
  const onSelect = (e: string[]) => {
    ;[currentFile.value] = e
  }
  // lifecycle
  onMounted(() => {
    if (isCloud.value) {
      window.grecaptcha.ready(async () => {
        try {
          const token = await window.grecaptcha.execute(VITE_RECAPTCHA_SITE_KEY, { action: 'submit' })
          const data = await getPlaygroundInfo(token, appStore.dbId)
        } catch (error) {
          refreshPlaygroundModal.value.toggleModal()
        }
      })
    }
  })
</script>

<style lang="stylus" rel="stylesheet/stylus" scoped>
  .playground
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
