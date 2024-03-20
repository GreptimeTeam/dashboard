<template lang="pug">
a-upload(action="/" @before-upload="beforeUpload")
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
  const file = ref(null as File | null)
  const beforeUpload = (newFile: File) => {
    console.log('before upload', newFile)
    // use filereader to read file
    const reader = new FileReader()
    reader.readAsText(newFile)
    reader.onload = (e: any) => {
      console.log(e.target.result)
    }
    file.value = newFile
    return false
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
