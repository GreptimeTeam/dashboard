<template lang="pug">
a-spin(style="width: 100%; height: 100%")
  a-layout.detail-layout.new-layout
    a-layout-sider(:resize-directions="['right']")
      a-card.files-card(:bordered="false")
        template(#title)
          a-space.space-between(fill style="width: 100%")
            | Log Pipelines
            a-button-group
              a-tooltip(mini position="bl" :content="$t('workbench.newFile')")
                a-button#new-file.icon-button(type="text" size="small" @click="clickNewFile")
                  template(#icon)
                    svg.icon-16
                      use(href="#file-add")

        a-scrollbar
          a-empty(v-if="!pipelines.length")
            template(#image)
              svg.icon-32
                use(href="#empty")
          a-menu(v-model:selected-keys="selectedKeys")
            a-menu-item(
              v-for="file in pipelines"
              :key="file.name"
              type="text"
              long
              style="margin-bottom: 0"
            )
              | {{ file.name }}.yaml
    a-layout-content.layout-content
      PipeFileView(
        :key="selectedKeys[0]"
        :filename="selectedKeys[0]"
        @refresh="handleList"
        @del="handleDel"
      )
</template>

<script lang="ts" name="PipeIndex" setup>
  import { list } from '@/api/pipeline'
  import type { PipeFile } from '@/api/pipeline'
  import PipeFileView from './PipeFileView.vue'

  const route = useRoute()
  const { filename } = route.query
  const selectedKeys = ref<Array<string>>(filename ? [filename as string] : [])
  const pipelines = ref<Array<PipeFile>>([])

  const router = useRouter()

  const clickNewFile = () => {
    selectedKeys.value = []
  }

  /* global BigInt */

  const handleList = () => {
    list().then((result) => {
      pipelines.value = result
      if (!pipelines.value.length) {
        selectedKeys.value = []
      }
      if (!selectedKeys.value.length) {
        if (pipelines.value.length) {
          selectedKeys.value = [pipelines.value[0].name as string]
        }
      }
    })
  }

  const handleDel = () => {
    selectedKeys.value = []
    handleList()
  }

  onMounted(() => {
    handleList()
  })

  watch(selectedKeys, (newVal) => {
    if (newVal && newVal[0]) {
      router.push({
        query: {
          filename: newVal[0],
        },
      })
    } else {
      router.push({
        query: {},
      })
    }
  })
</script>

<style lang="less" scoped>
  // var(--main-font-color)
  :deep(.arco-menu-vertical .arco-menu-inner) {
    padding: 0;
  }
  :deep(.arco-menu-light .arco-menu-item.arco-menu-selected) {
    color: var(--brand-color);
  }
</style>
