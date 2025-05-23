<template lang="pug">
a-layout-header
  TopBar(
    :disabled="!formState.content.trim()"
    :loading="loading"
    :hasDoc="false"
    @submit="handleSubmit"
  )
a-layout-content.main-content
  a-card.light-editor-card(:bordered="false")
    CodeMirror(
      v-model="formState.content"
      :placeholder="placeholder"
      :extensions="extensions"
      :style="style"
      :spellcheck="true"
      :autofocus="true"
      :indent-with-tab="true"
      :tabSize="2"
    )
</template>

<script lang="ts" setup name="LogIngestionInput">
  import { Codemirror as CodeMirror } from 'vue-codemirror'
  import { basicSetup } from 'codemirror'
  import type { Log } from '@/store/modules/log/types'

  const route = useRoute()
  const { pushLog } = useLog(route)
  const { activeTab, footer } = storeToRefs(useIngestStore())

  // Set active tab when component is activated
  onActivated(() => {
    activeTab.value = 'log-ingestion-input'
  })

  const loading = ref(false)
  const placeholder = 'Enter your log data here...'
  const style = {
    height: '100%',
  }
  const extensions = [basicSetup]

  const formState = reactive({
    content: '',
  })

  const handleSubmit = async (pipeline: string) => {
    if (!formState.content.trim()) {
      return
    }

    loading.value = true

    // Simulate processing with delay
    try {
      // Replace this with actual API call
      // await new Promise((resolve) => setTimeout(resolve, 500))

      // // Success log
      // const log: Log = {
      //   type: 'log-ingestion-input',
      //   codeInfo: '',
      //   message: `Processed ${formState.content.length} characters with pipeline "${pipeline}"`,
      //   startTime: new Date(),
      //   networkTime: 500, // mock network time
      // }

      // pushLog(log, 'log-ingestion-input')
      footer.value[activeTab.value] = false
    } catch (error) {
      // Error log
      // const log: Log = {
      //   type: 'log-ingestion-input',
      //   codeInfo: '',
      //   message: '',
      //   error: error.message || 'Processing failed',
      //   startTime: new Date(),
      // }
      // pushLog(log, 'log-ingestion-input')
    } finally {
      loading.value = false
    }
  }
</script>

<style lang="less">
  .arco-card.light-editor-card {
    height: 100%;
    border-radius: 4px;

    .arco-card-body {
      height: 100%;
    }

    .ͼc {
      color: #0550ae;
    }

    .ͼo {
      font-size: 14px;

      .cm-gutters {
        background-color: var(--grey-bg-color);
      }
    }

    .ͼ1 .cm-scroller {
      border-radius: 4px;
    }

    .ͼ1 .cm-content {
      padding: 10px 0 !important;
      width: calc(100% - 40px);
      white-space: pre-wrap;
    }

    .ͼ1 .cm-line {
      padding: 0 8px;
      color: var(--main-font-color);
    }

    .ͼ1 .cm-selectionMatch {
      background-color: rgba(255, 255, 0, 0.4);
    }

    .ͼ1.cm-editor {
      border: 1px solid var(--border-color);
      border-radius: 4px;
    }

    .ͼ1.cm-editor.cm-focused {
      outline: 0;
    }
  }
</style>
