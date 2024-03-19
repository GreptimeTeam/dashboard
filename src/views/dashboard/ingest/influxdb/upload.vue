<template lang="pug">
div
  .upload-box(v-if="!file")
    button(@click="uploadFile") Upload File
  .file-info(v-else)
    p File Name: {{ file.name }}
    p File Size: {{ file.size }} bytes
    button(@click="uploadFile") Reupload File
</template>

<script setup lang="ts">
  const file = null
  const uploadFile = () => {
    // let input = document.createElement('input')
    // input.type = 'file'
    // input.onchange = (e) => {
    //   this.file = e.target.files[0]
    // }
    // input.click()
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
