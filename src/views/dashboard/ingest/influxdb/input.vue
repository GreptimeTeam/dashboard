<template lang="pug">
a-layout-header
  TopBar(:disabled="!data.trim()" :loading="false" @submit="submit")
a-layout-content.main-content
  a-card.light-editor-card(:bordered="false")
    CodeMirror(
      v-model="data"
      :extensions="extensions"
      :style="style"
      :spellcheck="true"
      :autofocus="true"
      :indent-with-tab="true"
      :tabSize="2"
    )
</template>

<script lang="ts" setup>
  import { Codemirror as CodeMirror } from 'vue-codemirror'
  import { basicSetup } from 'codemirror'
  import type { Log } from '@/store/modules/log/types'

  const { writeInfluxDB } = useCodeRunStore()
  const { activeTab } = storeToRefs(useIngestStore())
  const { pushLog } = useLog()

  const data = ref('')
  const style = {
    height: '100%',
  }
  const loading = ref(false)
  const extensions = [basicSetup]

  const submit = async (precision: string) => {
    loading.value = true
    const result = await writeInfluxDB(data.value, precision)
    let log: Log
    if (Reflect.has(result, 'error')) {
      // error
      log = {
        type: activeTab.value,
        codeInfo: '',
        message: '',
        error: result.error,
        startTime: result.startTime,
      }
    } else {
      log = {
        type: activeTab.value,
        codeInfo: '',
        message: 'Data written',
        startTime: result.startTime,
        networkTime: result.networkTime,
      }
    }
    pushLog(log, activeTab.value)
    loading.value = false
  }

  onMounted(() => {
    console.log('mounted write')
  })
  onActivated(() => {
    console.log('activated write')
  })
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
