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
      .upload-box(v-if="!file")
        a-space(size="middle" direction="vertical" align="center")
          | Drop or click to upload(10MB max)
          a-button(type="primary") Upload
      .file-info(v-else)
        p File Name: {{ file.name }}
        p File Size: {{ fileSize }}
        a-button Reupload File
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

  onMounted(() => {
    console.log('upload mounted')
  })
  onActivated(() => {
    console.log('activated upload')
  })
</script>

<style scoped>
  .upload-box {
    width: 200px;
    height: 200px;
    border: 2px dashed #000;
    display: flex;
    justify-content: center;
    align-items: center;
  }

  .file-info {
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
  }
</style>
