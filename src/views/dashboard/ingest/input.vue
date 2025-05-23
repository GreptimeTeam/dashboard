<template lang="pug">
IngestMainContent(:type="type")
  template(#top-bar)
    component(
      :is="topBarComponent"
      :disabled="!formState.content.trim()"
      :loading="loading"
      :hasDoc="hasDoc"
      @submit="handleSubmit"
    )
  a-card.light-editor-card(:bordered="false")
    code-mirror(
      v-model="formState.content"
      :placeholder="placeholder"
      :extensions="extensions"
      :style="style"
      :spellcheck="true"
      :autofocus="true"
      :indent-with-tab="true"
      :tabSize="2"
    )
</template>

<script lang="ts" name="IngestInput" setup>
  import { Codemirror as CodeMirror } from 'vue-codemirror'
  import { basicSetup } from 'codemirror'

  // Component specific props
  const props = defineProps({
    type: {
      type: String,
      required: true,
    },
    placeholder: {
      type: String,
      default: 'Enter data here...',
    },
    processFunction: {
      type: Function,
      default: null,
    },
    topBarComponent: {
      type: Object,
      required: true,
    },
    hasDoc: {
      type: Boolean,
      default: false,
    },
  })

  // Refs to baseIngest component
  const baseIngest = ref(null)

  // Common setup for input
  const loading = ref(false)
  const style = {
    height: '100%',
  }
  const extensions = [basicSetup]

  const formState = reactive({
    content: '',
  })

  // Set active tab when component is activated
  onActivated(() => {
    if (baseIngest.value) {
      baseIngest.value.setActiveTab()
    }
  })

  // Handle submit with the appropriate parameters
  const handleSubmit = async (param) => {
    if (!formState.content.trim()) {
      return
    }

    loading.value = true

    try {
      // Use custom process function if provided, otherwise use a default implementation
      if (props.processFunction) {
        const result = await props.processFunction(formState.content, param)
        if (baseIngest.value) {
          baseIngest.value.pushLog(result, props.type)
          baseIngest.value.footer[baseIngest.value.activeTab] = false
        }
      } else {
        // Default implementation - simulate processing with delay
        // await new Promise((resolve) => setTimeout(resolve, 500))
        // const log: Log = {
        //   type: props.type,
        //   codeInfo: '',
        //   message: `Processed ${formState.content.length} characters with ${param}`,
        //   startTime: new Date(),
        //   networkTime: 500,
        // }
        // if (baseIngest.value) {
        //   baseIngest.value.pushLog(log, props.type)
        //   baseIngest.value.footer[baseIngest.value.activeTab] = false
        // }
      }
    } catch (error) {
      // Error handling
      //   const log: Log = {
      //     type: props.type,
      //     codeInfo: '',
      //     message: '',
      //     error: error.message || 'Processing failed',
      //     startTime: new Date(),
      //   }
      //   if (baseIngest.value) {
      //     baseIngest.value.pushLog(log, props.type)
      //   }
    } finally {
      loading.value = false
    }
  }
</script>

<style lang="less">
  .arco-card.light-editor-card {
    height: 100%;
    border-radius: 4px;

    .arco-card-body {
      height: 100%;
    }

    .ͼc {
      color: #0550ae;
    }

    .ͼo {
      font-size: 14px;

      .cm-gutters {
        background-color: var(--grey-bg-color);
      }
    }

    .ͼ1 .cm-scroller {
      border-radius: 4px;
    }

    .ͼ1 .cm-content {
      padding: 10px 0 !important;
      width: calc(100% - 40px);
      white-space: pre-wrap;
    }

    .ͼ1 .cm-line {
      padding: 0 8px;
      color: var(--main-font-color);
    }

    .ͼ1 .cm-selectionMatch {
      background-color: rgba(255, 255, 0, 0.4);
    }

    .ͼ1.cm-editor {
      border: 1px solid var(--border-color);
      border-radius: 4px;
    }

    .ͼ1.cm-editor.cm-focused {
      outline: 0;
    }
  }
</style>
