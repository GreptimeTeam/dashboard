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
        p File Size: {{ file.size }} bytes
        a-button Reupload File
</template>

<script lang="ts" setup>
  import Message from '@arco-design/web-vue/es/message'

  const { writeInfluxDB } = useCodeRunStore()

  const file = ref(null as File | null)
  const isWriteLoading = ref(false)
  const dataFromFile = ref('')
  const beforeUpload = (newFile: File) => {
    console.log('before upload', newFile)
    if (newFile.size > 10 * 1024 * 1024) {
      // file size limit
      Message.error('File size limit 10MB')
      return false
    }
    // use fileReader to read file
    const reader = new FileReader()
    reader.readAsText(newFile)
    reader.onload = (e: any) => {
      console.log('onload', e.target.result)
      dataFromFile.value = e.target.result
    }
    reader.onloadstart = () => {
      console.log('start')
    }
    reader.onloadend = () => {
      console.log('end')
    }
    reader.onprogress = (e: ProgressEvent) => {
      console.log('progress', e)
    }
    file.value = newFile
    return false
  }

  const submit = async (precision: string) => {
    isWriteLoading.value = true
    const result = await writeInfluxDB(dataFromFile.value, precision)
    console.log('result', result)
    if (Reflect.has(result, 'error')) {
      // error
    } else {
      // success
      // clear file
      file.value = null
    }
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
