<template lang="pug">
base-ingest(:type="type")
  template(#top-bar)
    component(:is="topBarComponent" :hasButtons="false")
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
    component(
      :is="topBarComponent"
      :disabled="!dataFromFile || isProcessLoading"
      :loading="isProcessLoading"
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

<script lang="ts" name="IngestUpload" setup>
  import { ref, computed, onActivated } from 'vue'
  import { Codemirror as CodeMirror } from 'vue-codemirror'
  import { basicSetup } from 'codemirror'
  import type { Log } from '@/store/modules/log/types'
  import BaseIngest from './BaseIngest.vue'

  // Component specific props
  const props = defineProps({
    type: {
      type: String,
      required: true,
    },
    processFunction: {
      type: Function,
      default: null,
    },
    topBarComponent: {
      type: Object,
      required: true,
    },
  })

  // Refs to baseIngest component
  const baseIngest = ref(null)

  // Set active tab when component is activated
  onActivated(() => {
    if (baseIngest.value) {
      baseIngest.value.setActiveTab()
    }
  })

  const file = ref(null)
  const visible = ref(false)
  const isProcessLoading = ref(false)
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

  const beforeUpload = (newFile) => {
    file.value = newFile
    sizeError.value = false
    if (newFile.size > 10 * 1024 * 1024) {
      sizeError.value = true
      return false
    }
    visible.value = true
    const reader = new FileReader()
    reader.readAsText(newFile)
    reader.onload = (e) => {
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

  const submit = async (param) => {
    isProcessLoading.value = true

    try {
      // Use custom process function if provided, otherwise use a default implementation
      if (props.processFunction) {
        const result = await props.processFunction(dataFromFile.value, param, file.value)
        if (baseIngest.value) {
          baseIngest.value.pushLog(result, props.type)
          baseIngest.value.footer[baseIngest.value.activeTab] = false
        }
      } else {
        // Default implementation - simulate processing with delay
        // await new Promise((resolve) => setTimeout(resolve, 500))
        // const fileInfo = file.value ? `${file.value.name}(${fileSize.value})` : ''
        // const codeTooltip =
        //   remainingLines.value > 0
        //     ? `${dataFromFile.value.split('\n').slice(0, 10).join('\n')}\n...${remainingLines.value} lines more`
        //     : dataFromFile.value
        // const log = {
        //   type: props.type,
        //   codeInfo: fileInfo,
        //   codeTooltip,
        //   message: 'File processed successfully',
        //   startTime: new Date(),
        //   networkTime: 500,
        // }
        // if (baseIngest.value) {
        //   baseIngest.value.pushLog(log, props.type)
        //   baseIngest.value.footer[baseIngest.value.activeTab] = false
        // }
      }

      visible.value = false
      resetFile()
    } catch (error) {
      // Error handling
      //   const log = {
      //     type: props.type,
      //     codeInfo: file.value ? `${file.value.name}(${fileSize.value})` : '',
      //     message: '',
      //     error: error.message || 'Processing failed',
      //     startTime: new Date(),
      //   }
      //   if (baseIngest.value) {
      //     baseIngest.value.pushLog(log, props.type)
      //   }
      //   errorMessage.value = error.message || 'Processing failed'
    } finally {
      isProcessLoading.value = false
    }
  }
</script>

<style lang="less" scoped>
  /* Same styles as in the original component */
</style>
