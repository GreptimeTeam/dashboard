<template lang="pug">
a-layout-header
  TopBar(:hasButtons="false")
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
          .tip Drop or click to upload (10MB max)
          a-button(type="primary" size="large") Upload
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
            .file-info {{ `The file size limit is 10MB` }}
          a-button(type="primary" size="large") Upload
a-modal(
  v-model:visible="visible"
  title="Preview file content"
  modal-class="file-modal"
  :footer="false"
  @close="resetFile"
)
  template(#title)
    TopBar(
      :disabled="!dataFromFile || isWriteLoading"
      :loading="isWriteLoading"
      :hasDoc="false"
      @submit="submit"
    )
  .error(v-if="errorMessage")
    a-alert(type="error" show-icon)
      a-typography-text(title="" :ellipsis="{ rows: 1, showTooltip: true }")
        | {{ errorMessage }}
  a-spin(tip="Reading file..." style="width: 100%" :loading="isReadingFile")
    a-card.file-scrollbar(:bordered="false")
      CodeMirror(v-if="dataFromFile" v-model="codeInEditor" :disabled="true")
    span.load(v-if="collapsed && remainingLines")
      a.text ...{{ remainingLines }} lines more
      a.button(type="text" size="mini" @click="loadMore") Expand
</template>

<script lang="ts" setup>
  import { Codemirror as CodeMirror } from 'vue-codemirror'
  import type { Log } from '@/store/modules/log/types'

  const { writeInfluxDB } = useCodeRunStore()
  const { activeTab, footer } = storeToRefs(useIngestStore())
  const { pushLog } = useLog()

  const file = ref(null as File | null)
  const visible = ref(false)
  const isWriteLoading = ref(false)
  const isReadingFile = ref(false)
  const sizeError = ref(false)
  const collapsed = ref(true)
  const dataFromFile = ref('')
  const codeInEditor = ref('')
  const errorMessage = ref('')

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

  const beforeUpload = (newFile: File) => {
    file.value = newFile
    sizeError.value = false
    if (newFile.size > 10 * 1024 * 1024) {
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

  const submit = async (precision: string) => {
    isWriteLoading.value = true
    const result = await writeInfluxDB(dataFromFile.value, precision)
    let log: Log
    const fileInfo = file.value ? `${file.value.name}(${fileSize.value})` : ''
    if (Reflect.has(result, 'error')) {
      // error
      log = {
        type: 'influxdb-upload',
        codeInfo: fileInfo,
        message: '',
        error: result.error,
        startTime: result.startTime,
      }
      errorMessage.value = result.error
    } else {
      // success
      // clear file
      const codeTooltip =
        remainingLines.value > 0
          ? `${dataFromFile.value.split('\n').slice(0, 10).join('\n')}\n...${remainingLines.value} lines more`
          : dataFromFile.value
      log = {
        type: 'influxdb-upload',
        codeInfo: fileInfo,
        codeTooltip,
        message: 'Data written',
        startTime: result.startTime,
        networkTime: result.networkTime,
      }
      visible.value = false
      resetFile()
    }
    pushLog(log, activeTab.value)
    footer.value[activeTab.value] = false
    isWriteLoading.value = false
  }
</script>

<style lang="less" scoped>
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
      padding: 30px 30px 15px 30px;
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
    .top-bar {
      padding: 0;
      width: 100%;
      .arco-select-view-single {
        width: 123px;
      }
    }
  }
</style>
