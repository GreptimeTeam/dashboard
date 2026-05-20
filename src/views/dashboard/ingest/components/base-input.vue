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
  a-card.editor-card.gpt-dark-editor-card(:bordered="false")
    .full-width-height-editor.card-editor.gpt-dark-editor.gpt-square-editor
      CodeMirror(
        v-model="content"
        :placeholder="config.placeholder"
        :extensions="extensions"
        :style="{ width: '100%', height: '100%' }"
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
  import { json } from '@codemirror/lang-json'
  import { oneDark } from '@codemirror/theme-one-dark'

  const props = defineProps({
    config: {
      type: Object,
      required: true,
    },
  })

  const { activeTab } = storeToRefs(useIngestStore())

  const loading = ref(false)
  const content = ref('')
  const docVisible = ref(false)

  const extensions = computed(() => {
    const contentType = props.config?.params?.contentType

    if (contentType === 'application/json' || contentType === 'application/x-ndjson') {
      return [basicSetup, json(), oneDark]
    }

    return [basicSetup, oneDark]
  })

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

    if (Reflect.has(result, 'error')) {
      // TODO: show error notification when ingest submit fails
    }
    loading.value = false
  }
</script>

<style lang="less" scoped>
  .main-content {
    display: flex;
    flex-direction: column;
    min-height: 0;

    .editor-card {
      flex: 1;
      min-height: 0;
    }
  }

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
