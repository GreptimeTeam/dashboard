<template lang="pug">
a-layout-header
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
      .upload-box
        a-space(direction="vertical" align="center" :size="30")
          .tip Drop or click to upload (10MB max)
          a-button(type="primary" size="large") Upload
        a-space(
          v-if="false"
          direction="vertical"
          align="center"
          :size="30"
        )
          a-space(direction="vertical" :size="10")
            .reupload
              svg.icon-30
                use(href="#bigupload")
            .file-info {{ `${file.name} (${fileSize})` }}
          a-button(type="secondary" size="large") Upload again
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
  a-spin(tip="Reading file..." style="width: 100%" :loading="isReadingFile")
    a-scrollbar(:style="{ 'max-height': `calc(100vh - 200px)`, overflow: 'auto', 'min-height': '100px' }")
      a-typography-paragraph(v-if="dataFromFile" title="" :ellipsis="{ rows: 12, expandable: true, ellipsisStr: '' }")
        template(#expand-node="{ expanded }")
          div(v-if="expanded") Collapse
          div(v-else)
            a.text ...
            a.button Load All
        | {{ dataFromFile }}
      .error(v-if="errorMessage")
        a-space(:size="10")
        a-alert(type="error" show-icon)
          a-typography-paragraph(title="" :ellipsis="{ rows: 3, showTooltip: true }")
            | {{ errorMessage }}
</template>

<script lang="ts" setup>
  import type { Log } from '@/store/modules/log/types'
  import Message from '@arco-design/web-vue/es/message'

  const { writeInfluxDB } = useCodeRunStore()
  const { activeTab, footer } = storeToRefs(useIngestStore())
  const { pushLog } = useLog()

  const file = ref(null as File | null)
  const visible = ref(false)
  const isWriteLoading = ref(false)
  const isReadingFile = ref(false)
  const dataFromFile = ref('')
  const errorMessage = ref('')

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
  }

  const beforeUpload = (newFile: File) => {
    if (newFile.size > 10 * 1024 * 1024) {
      Message.error('File size limit 10MB')
      return false
    }
    visible.value = true
    const reader = new FileReader()
    reader.readAsText(newFile)
    reader.onload = (e: any) => {
      dataFromFile.value = e.target.result
    }
    reader.onloadstart = () => {
      isReadingFile.value = true
    }
    reader.onloadend = () => {
      isReadingFile.value = false
    }
    file.value = newFile
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
      resetFile()
      log = {
        type: 'influxdb-upload',
        codeInfo: fileInfo,
        codeTooltip: dataFromFile.value.split('\n').slice(0, 10).join('\n'),
        message: 'Data written',
        startTime: result.startTime,
        networkTime: result.networkTime,
      }
      visible.value = false
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
    color: var(--brand-color);
    justify-content: center;
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

  :deep(.arco-typography) {
    font-family: monospace;
    color: var(--main-font-color);
    margin: 0;
    border-radius: 4px;
    border: 1px solid var(--border-color);
    padding: 10px;

    .arco-typography-operation-expand {
      color: var(--brand-color);
      font-family: 'Open Sans';
      display: flex;
      .text {
        color: var(--main-font-color);
      }
      .button {
        text-decoration-line: underline;
      }
    }
  }

  :deep(.arco-spin-tip) {
    color: var(--brand-color);
  }
</style>

<style lang="less">
  .arco-modal.file-modal {
    .arco-modal-header {
      height: auto;
    }
    .arco-modal-body {
      padding: 0 20px 20px 20px;
    }
    .top-bar {
      padding: 20px 0;
      width: 100%;
      .arco-select-view-single {
        width: 123px;
      }
    }
  }
</style>
