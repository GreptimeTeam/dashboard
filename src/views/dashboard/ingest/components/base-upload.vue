<template lang="pug">
a-layout-header
  TopBarIngest(:hasButtons="false")
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
  a-upload(
    action="/"
    :auto-upload="false"
    :multiple="false"
    :file-list="file ? [{ name: file.name, size: file.size }] : []"
    :show-file-list="false"
    @before-upload="beforeUpload"
  )
    template(#upload-button)
      .upload-box(:class="{ error: sizeError }")
        a-space(
          v-if="!sizeError"
          direction="vertical"
          align="center"
          :size="30"
        )
          .tip {{ config.dragText || 'Drop or click to upload' }} ({{ config.maxSize || 10 }}MB max)
          a-button(type="primary" size="large") {{ config.buttonText || 'Upload' }}
        a-space(
          v-else
          direction="vertical"
          align="center"
          :size="30"
        )
          a-space(direction="vertical" align="center" :size="10")
            .reupload
              svg.icon-30
                use(href="#mistake30")
            .tip {{ `${file.name} (${fileSize}) is too large` }}
            .file-info {{ `The file size limit is ${config.maxSize || 10}MB` }}
          a-button(type="primary" size="large") {{ config.buttonText || 'Upload' }}

  a-modal(
    v-model:visible="visible"
    modal-class="file-modal"
    :title="config.modalTitle || 'Preview file content'"
    :footer="false"
    @close="resetFile"
  )
    template(#title)
      TopBarIngest(
        :disabled="!dataFromFile || isProcessLoading"
        :loading="isProcessLoading"
        :submitLabel="config.submitLabel || 'Process'"
        @submit="submit"
      )
        template(#selector)
          slot(name="modal-selector" :config="config")

    .error(v-if="errorMessage")
      a-alert(type="error" show-icon)
        a-typography-text(title="" :ellipsis="{ rows: 1, showTooltip: true }") {{ errorMessage }}

    a-spin(style="width: 100%" :tip="config.readingTip || 'Reading file...'" :loading="isReadingFile")
      a-card.file-scrollbar(:bordered="false")
        CodeMirror(
          v-model="codeInEditor"
          :style="{ height: '100%' }"
          :extensions="extensions"
          :spellcheck="true"
          :indent-with-tab="true"
          :tabSize="2"
          :disabled="true"
        )
      span.load(v-if="collapsed && remainingLines")
        a.text ...{{ remainingLines }} lines more
        a.button(type="text" size="mini" @click="loadMore") {{ config.expandText || 'Expand' }}

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
  import { json } from '@codemirror/lang-json' // 导入JSON语法支持
  import type { Log } from '@/store/modules/log/types'
  import { isObject } from '@/utils/is'

  const props = defineProps({
    config: {
      type: Object,
      required: true,
    },
  })

  const route = useRoute()
  const { pushLog } = useLog(route)
  const { activeTab, footer } = storeToRefs(useIngestStore())

  const file = ref(null)
  const visible = ref(false)
  const isProcessLoading = ref(false)
  const isReadingFile = ref(false)
  const sizeError = ref(false)
  const collapsed = ref(true)
  const dataFromFile = ref('')
  const codeInEditor = ref('')
  const errorMessage = ref('')

  const docVisible = ref(false)

  const toggleDoc = () => {
    docVisible.value = !docVisible.value
  }

  onActivated(() => {
    activeTab.value = props.config.tabKey
  })

  const remainingLines = computed(() => {
    return dataFromFile.value.split('\n').length > 10 ? dataFromFile.value.split('\n').length - 10 : 0
  })

  const loadMore = () => {
    collapsed.value = false
    codeInEditor.value = dataFromFile.value
  }

  const fileSize = computed(() => {
    if (file.value) {
      if (file.value.size < 1024) {
        return `${file.value.size} bytes`
      }
      if (file.value.size < 1024 * 1024) {
        return `${(file.value.size / 1024).toFixed(2)} KB`
      }
      return `${(file.value.size / 1024 / 1024).toFixed(2)} MB`
    }
    return 0
  })

  const resetFile = () => {
    file.value = null
    errorMessage.value = ''
    dataFromFile.value = ''
    codeInEditor.value = ''
    collapsed.value = true
    sizeError.value = false
  }

  const beforeUpload = (newFile) => {
    file.value = newFile
    sizeError.value = false

    const maxBytes = (props.config.maxSize || 10) * 1024 * 1024
    if (newFile.size > maxBytes) {
      sizeError.value = true
      return false
    }

    visible.value = true
    const reader = new FileReader()
    reader.readAsText(newFile)
    reader.onload = (e: any) => {
      collapsed.value = true
      dataFromFile.value = e.target.result
      codeInEditor.value = dataFromFile.value.split('\n').slice(0, 10).join('\n')
    }
    reader.onloadstart = () => {
      isReadingFile.value = true
    }
    reader.onloadend = () => {
      isReadingFile.value = false
    }
    return false
  }

  const submit = async () => {
    if (!dataFromFile.value || isProcessLoading.value) return

    isProcessLoading.value = true
    const result = await props.config.submitHandler(dataFromFile.value, props.config.params)

    const fileInfo = file.value ? `${file.value.name}(${fileSize.value})` : ''

    let log: Log
    if (isObject(result) && Reflect.has(result, 'error')) {
      log = {
        type: props.config.tabKey,
        codeInfo: fileInfo,
        message: '',
        error: result.error,
        startTime: result.startTime,
      }
      errorMessage.value = result.error
    } else {
      const codeTooltip =
        remainingLines.value > 0
          ? `${dataFromFile.value.split('\n').slice(0, 10).join('\n')}\n...${remainingLines.value} lines more`
          : dataFromFile.value

      log = {
        type: props.config.tabKey,
        codeInfo: fileInfo,
        codeTooltip,
        message: 'Data written',
        startTime: result.startTime,
        networkTime: result.networkTime,
      }

      resetFile()
      visible.value = false
    }

    pushLog(log, props.config.tabKey)
    footer.value[activeTab.value] = false
    isProcessLoading.value = false
  }

  const extensions = computed(() => {
    const contentType = props.config?.params?.contentType

    if (contentType === 'application/json' || contentType === 'application/x-ndjson') {
      return [basicSetup, json()]
    }

    return [basicSetup]
  })
</script>

<style lang="less" scoped>
  .top-bar {
    display: flex;
    justify-content: space-between;
    padding-right: 20px;
    height: 58px;
    background: var(--card-bg-color);
  }

  .arco-upload {
    width: 100%;
    padding: 0 105px;
    max-width: 960px;
  }

  .upload-box {
    width: 100%;
    height: 262px;
    border: 2px dashed var(--border-color);
    display: flex;
    justify-content: center;
    align-items: center;
    &.error {
      border-color: var(--danger-color);
      background: var(--danger-bg-color);
    }
    .arco-btn {
      font-weight: 800;
      font-size: 14px;
      font-family: 'Gilroy';
      padding: 12px 32px;
      height: 42px;
    }
  }

  .tip {
    font-family: 'Gilroy';
    font-weight: 800;
    font-size: 16px;
    color: var(--main-font-color);
    line-height: 28px;
  }

  .reupload {
    display: flex;
    justify-content: center;
    padding-bottom: 10px;
  }

  .file-info {
    font-size: 13px;
    line-height: 20px;
  }

  .main-content {
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .error {
    :deep(.arco-alert) {
      padding: 7px 16px;
      border-radius: 4px;
      background: var(--danger-bg-color);
      .arco-typography {
        color: var(--main-font-color);
        margin: 0;
        font-size: 13px;
      }
    }
  }

  :deep(.arco-card.file-scrollbar) {
    max-height: calc(100vh - 200px);
    overflow: auto;
    min-height: 100px;
    border-radius: 0;

    .ͼ1 .cm-content {
      width: calc(100% - 40px);
      white-space: pre-wrap;
    }
    .ͼ4 .cm-line {
      color: var(--main-font-color);
    }
  }

  :deep(.arco-spin-tip) {
    color: var(--brand-color);
  }
</style>

<style lang="less">
  .arco-modal.file-modal {
    width: 800px;
    .arco-modal-header {
      height: auto;
      padding: 15px 30px 0 30px;
      .arco-modal-close-btn {
        font-size: 16px;
      }
    }
    .arco-modal-body {
      padding: 0 30px 30px 30px;
      .arco-spin {
        margin-top: 15px;
        border: 1px solid var(--border-color);
        border-radius: 4px;
      }
      .load {
        padding-left: 6px;
        font-size: 13px;
      }
      .text {
        color: var(--main-font-color);
        padding-right: 4px;
      }
      .button {
        cursor: pointer;
        color: var(--brand-color);
        text-decoration-line: underline;
      }
    }
  }
</style>
