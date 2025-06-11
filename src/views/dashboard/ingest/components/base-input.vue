<template lang="pug">
a-layout-header
  TopBarIngest(
    :disabled="!content.trim()"
    :loading="loading"
    :submitLabel="config.submitLabel"
    @submit="handleSubmit"
  )
    template(#selector)
      slot(name="selector" :config="config")
    template(#extra)
      slot(
        name="extra"
        :toggleDoc="toggleDoc"
        :docVisible="docVisible"
        :config="config"
      )
a-layout-content.main-content
  a-card.light-editor-card(:bordered="false")
    CodeMirror(
      v-model="content"
      :placeholder="config.placeholder"
      :extensions="extensions"
      :style="style"
      :spellcheck="true"
      :autofocus="true"
      :indent-with-tab="true"
      :tabSize="2"
    )

a-drawer.ingest(
  v-if="config.hasDoc"
  v-model:visible="docVisible"
  placement="right"
  title=""
  :width="510"
  :footer="false"
)
  slot(name="doc-content" :config="config")
</template>

<script lang="ts" setup>
  import { Codemirror as CodeMirror } from 'vue-codemirror'
  import { basicSetup } from 'codemirror'
  import type { Log } from '@/store/modules/log/types'

  const props = defineProps({
    config: {
      type: Object,
      required: true,
    },
  })

  const route = useRoute()
  const { pushLog } = useLog(route)
  const { activeTab, footer } = storeToRefs(useIngestStore())

  const loading = ref(false)
  const content = ref('')
  const docVisible = ref(false)
  const style = { height: '100%' }
  const extensions = [basicSetup]

  const toggleDoc = () => {
    docVisible.value = !docVisible.value
  }

  onActivated(() => {
    activeTab.value = props.config.tabKey
  })

  const handleSubmit = async () => {
    if (!content.value.trim()) return

    loading.value = true
    const result = await props.config.submitHandler(content.value, props.config.params)

    let log: Log
    if (Reflect.has(result, 'error')) {
      log = {
        type: props.config.tabKey,
        codeInfo: '',
        message: '',
        error: result.error,
        startTime: result.startTime,
      }
    } else {
      log = {
        type: props.config.tabKey,
        codeInfo: '',
        message: 'Data written',
        startTime: result.startTime,
        networkTime: result.networkTime,
      }
    }

    pushLog(log, props.config.tabKey)
    footer.value[activeTab.value] = false
    loading.value = false
  }
</script>

<style lang="less" scoped>
  .ingest {
    :deep(.arco-drawer-header) {
      display: none;
    }

    :deep(.arco-drawer-body) {
      font-size: 14px;
      color: var(--main-font-color);
      padding: 24px;
      display: flex;
      flex-direction: column;
      line-height: 24px;
    }

    .markdown-container {
      margin-bottom: 30px;
    }
  }
</style>
