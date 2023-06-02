<template lang="pug">
a-layout.layout
  a-layout-sider
    a-tree.script-tree(
      blockNode
      :data="fileListIndex"
      :selected-keys="[currentFile]"
      @select="onSelect"
    )
  a-layout-content
    .markdown-container
      RenderHtml(:file="fileList[currentFile]")
    RefreshPlaygroundModal(ref="refreshPlaygroundModal")
</template>

<script lang="ts" setup name="Playground">
  import { getPlaygroundInfo } from '@/api/playground'
  import parseMD from 'parse-md'
  // data
  const { isCloud } = storeToRefs(useAppStore())
  const appStore = useAppStore()
  const router = useRouter()
  const { getGistFiles } = useGist()

  const refreshPlaygroundModal = ref()
  const currentFile = ref('')
  const officialMdFiles = ref(import.meta.glob('./docs/*.md', { as: 'raw', eager: true }))
  const gistFiles = ref({})
  const fileList = ref({} as any)

  const { gistId } = router.currentRoute.value.query
  const { filename } = router.currentRoute.value.params

  const fileListIndex = computed(() => {
    return Object.keys(fileList.value).map((key) => ({
      key,
      title: key,
    }))
  })
  // methods
  const onSelect = (e: string[]) => {
    router.push({
      name: 'playground',
      query: {
        gistId,
      },
      params: {
        filename: encodeURIComponent(e[0]),
      },
    })
  }

  const loadFilesFromGist = async () => {
    if (gistId) {
      gistFiles.value = (await getGistFiles(gistId as string)).reduce((obj: any, file: any) => {
        obj[file.filename] = file.content
        return obj
      }, {}) as any
    }
  }
  // lifecycle

  const makeFileList = () => {
    Object.values({
      ...gistFiles.value,
      ...officialMdFiles.value,
    }).forEach((content) => {
      const res: any = parseMD(content as string)
      if (res.metadata && res.metadata.title) {
        fileList.value[res.metadata.title] = res
      }
    })

    currentFile.value = (filename && decodeURIComponent(filename as string)) || Object.keys(fileList.value)[0]
  }
  onMounted(async () => {
    if (appStore.lifetime === 'temporary' && isCloud.value) {
      try {
        const data = await getPlaygroundInfo(appStore.dbId)
      } catch (error) {
        refreshPlaygroundModal.value.toggleModal()
      }
    }
    loadFilesFromGist()
    makeFileList()
  })

  watch(() => gistFiles.value, makeFileList)
</script>

<style lang="stylus" rel="stylesheet/stylus" scoped>
  .arco-layout-sider
    background-color #fff
    border-radius 10px
    width 180px !important
  .markdown-container
    background-color #fff
    border-radius 10px
    padding 10px 20px
</style>
