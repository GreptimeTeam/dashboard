<template lang="pug">
a-layout.layout
  a-layout-sider
    a-tree.script-tree.playground-sidebar(
      blockNode
      :data="fileListIndex"
      :selected-keys="[currentFile]"
      @select="onSelect"
    )
  a-layout-content
    .markdown-container(v-if="fileList[currentFile]")
      markdownRender(:md="fileList[currentFile]")
    RefreshPlaygroundModal(ref="refreshPlaygroundModal")
</template>

<script lang="ts" setup name="Playground">
  import { getPlaygroundInfo } from '@/api/playground'
  import parseMD from 'parse-md'
  // data
  const appStore = useAppStore()
  const router = useRouter()
  const { getGistFiles } = useGist()
  const { role } = storeToRefs(useUserStore())

  const refreshPlaygroundModal = ref()
  const currentFile = ref('')
  const officialMdFiles = ref(import.meta.glob('./docs/*.md', { as: 'raw', eager: true }))
  const gistFiles = ref({})
  const fileList = ref({} as any)

  const fileListIndex = computed(() => {
    return Object.keys(fileList.value).map((key) => ({
      key,
      title: key,
    }))
  })
  // methods
  const onSelect = (e: string[]) => {
    ;[currentFile.value] = e
  }
  // lifecycle
  onMounted(async () => {
    const { gistId } = router.currentRoute.value.query

    if (appStore.lifetime === 'temporary' && role.value !== 'admin') {
      try {
        const data = await getPlaygroundInfo(appStore.dbId)
      } catch (error) {
        refreshPlaygroundModal.value.toggleModal()
      }
    }

    if (gistId) {
      gistFiles.value = (await getGistFiles(gistId as string)).reduce((obj: any, file: any) => {
        obj[file.filename] = file.content
        return obj
      }, {}) as any
    }

    Object.values({
      ...gistFiles.value,
      ...officialMdFiles.value,
    }).forEach((value) => {
      const res: any = parseMD(value as string)
      if (res.metadata && res.metadata.title) {
        fileList.value[res.metadata.title] = value
      }
    })

    currentFile.value = Object.keys(fileList.value)[0]
  })
</script>

<style lang="stylus" rel="stylesheet/stylus" scoped>
  .arco-layout-sider {
    background-color: #fff;
    border-radius: 10px;
  }

  .markdown-container {
    background-color: #fff;
    border-radius: 10px;
    padding: 10px 20px;
  }
</style>
