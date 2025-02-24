<template>
  <div class="flex">
    <div style="display: flex; align-items: center; justify-content: center"
      >Current version:&nbsp; <h2>{{ version }}</h2></div
    >
    <button v-disabled="!isChecking && !newUpdate" class="btn" @click="checkUpdate"> Check update </button>
    <button v-if="!isInstalling && newUpdate" class="btn" @click="install"> Install update </button>
    <div v-if="isInstalling" class="progress">
      <span>{{ progress }}%</span>
      <div class="progress-bar" :style="{ width: progress + '%' }"></div>
    </div>
    <br />
    <div v-if="!isChecking && noUpdate">No update available</div>
  </div>
</template>

<script setup>
  import { ref, computed } from 'vue'
  import { check } from '@tauri-apps/plugin-updater'
  import { relaunch } from '@tauri-apps/plugin-process'
  import { getVersion } from '@tauri-apps/api/app'

  const isChecking = ref(false)
  const isInstalling = ref(false)
  const newUpdate = ref(null)
  const totalSize = ref(0)
  const downloadedSize = ref(0)
  const noUpdate = ref(false)
  const version = ref('')
  getVersion().then((v) => {
    version.value = v
  })

  const progress = computed(() => (totalSize.value ? Math.round((downloadedSize.value / totalSize.value) * 100) : 0))

  async function checkUpdate() {
    isChecking.value = true
    try {
      const update = await check()
      if (!update) {
        noUpdate.value = true
        return
      }
      console.log(`Should update: ${update.available}`, update)
      newUpdate.value = update
    } catch (e) {
      console.error(e)
    } finally {
      isChecking.value = false
    }
  }

  async function install() {
    if (!newUpdate.value) return

    isInstalling.value = true
    downloadedSize.value = 0
    try {
      await newUpdate.value.downloadAndInstall((downloadProgress) => {
        switch (downloadProgress.event) {
          case 'Started':
            totalSize.value = downloadProgress.data.contentLength
            break
          case 'Progress':
            downloadedSize.value += downloadProgress.data.chunkLength
            break
          default:
            break
        }
      })
      console.log('Installation complete, restarting...')
      // await new Promise((resolve) => setTimeout(resolve, 2000))
      await relaunch()
    } catch (e) {
      console.error(e)
    } finally {
      isInstalling.value = false
    }
  }
</script>

<style scoped>
  .flex {
    display: flex;
    justify-content: center;
    align-items: center;
    flex-direction: column;
    margin: 0 auto;
  }
  .progress {
    width: 100%;
    height: 50px;
    position: relative;
    margin-top: 5%;
  }

  .progress > span {
    font-size: 1.2rem;
  }

  .progress-bar {
    height: 30px;
    background-color: hsl(32, 94%, 46%);
    border: 1px solid #333;
  }
</style>
