<template lang="pug">
a-layout-header
  TopBar(:disabled="!file" :loading="isWriteLoading" @submit="submit")
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
        a-space(
          v-if="!file"
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
          a-space(direction="vertical" :size="10")
            .reupload
              svg.icon-30
                use(href="#bigupload")
            .file-info {{ `${file.name} (${fileSize})` }}
          a-button(type="secondary" size="large") Upload again
</template>

<script lang="ts" setup>
  import type { Log } from '@/store/modules/log/types'
  import Message from '@arco-design/web-vue/es/message'

  const { writeInfluxDB } = useCodeRunStore()
  const { activeTab } = storeToRefs(useIngestStore())
  const { pushLog } = useLog()

  const file = ref(null as File | null)
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
  const isWriteLoading = ref(false)
  const dataFromFile = ref('')
  const beforeUpload = (newFile: File) => {
    if (newFile.size > 10 * 1024 * 1024) {
      Message.error('File size limit 10MB')
      return false
    }
    const reader = new FileReader()
    reader.readAsText(newFile)
    reader.onload = (e: any) => {
      dataFromFile.value = e.target.result
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
    } else {
      // success
      // clear file
      file.value = null
      log = {
        type: 'influxdb-upload',
        codeInfo: fileInfo,
        message: 'Data written',
        startTime: result.startTime,
        networkTime: result.networkTime,
      }
    }
    pushLog(log, activeTab.value)
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
</style>
