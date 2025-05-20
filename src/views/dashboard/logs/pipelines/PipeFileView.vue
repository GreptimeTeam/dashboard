<template lang="pug">
a-page-header(title="Pipeline Configuration" :show-back="false")

a-alert Pipeline is a mechanism in GreptimeDB for parsing and transforming log data, <a href="https://docs.greptime.com/user-guide/logs/pipeline-config" target="_blank">read more</a>
a-layout.full-height-layout(style="box-shadow: 0 2px 5px 0 rgba(0, 0, 0, 0.08)")
  a-layout-sider(:resize-directions="['right']" :width="800")
    a-card(title="Pipeline" :bordered="false")
      template(#extra)
        a-space
          a-button(type="primary" size="small" @click="handleSave")
            | Save
          a-popconfirm(content="Are you sure you want to delete?" @ok="handleDelete")
            a-button(
              v-if="!isCreating"
              type="text"
              status="warning"
              size="small"
            )
              | Delete
      a-form(
        ref="formRef"
        layout="vertical"
        style="padding: 0 10px; margin-top: 20px"
        :model="currFile"
        :disabled="!isCreating"
        :rules="rules"
      )
        .form-description Input the pipeline configuration here to define how logs are parsed and transformed, You can test on the right side whether it's already saved.
        a-form-item(field="name" label="Pipeline name" style="width: 200px")
          a-input(v-model="currFile.name" placeholder="Pipeline name")
        a-form-item(v-if="!isCreating" field="version" label="Version")
          | {{ currFile.version }}
        a-form-item(field="content" label="Yaml Content")
          template(#help)
            div 
          .editor-container
            YMLEditorSimple(v-model="currFile.content" style="width: 100%")
  a-layout-content
    .content-container
      a-card.light-editor-card(title="Input" :bordered="false")
        template(#extra)
          a-space
            a-button(size="small" @click="handleDebug") Test
            a-select(v-model="selectedContentType" style="width: 150px" placeholder="Content Type")
              a-option(value="text/plain") text
              a-option(value="application/json") json
              a-option(value="application/x-ndjson") ndjson
        .right-content
          a-alert(v-if="ymlError" type="error")
            | {{ ymlError }}
          a-typography-text(type="secondary")
            | Input your original log to see parse results.
          .input-editor
            CodeMirror(
              v-model="debugForm.content"
              style="width: 100%; height: 100%"
              :extensions="extensions"
              :spellcheck="true"
              :autofocus="true"
              :indent-with-tab="true"
              :tabSize="2"
              :placeholder="debugTip"
            )

      a-card.light-editor-card(title="Output" :bordered="false")
        .right-content
          a-typography-text(type="secondary")
            | Parsed logs displayed here. Logs that ingested via API will follow this structure.
          .output-editor
            CodeMirror(
              style="width: 100%; height: 100%"
              :model-value="debugResponse"
              :extensions="extensions"
              :spellcheck="true"
              :autofocus="true"
              :indent-with-tab="true"
              :tabSize="2"
              :disabled="true"
            )
</template>

<script setup name="PipeFileView" lang="ts">
  import { Notification } from '@arco-design/web-vue'
  import { Codemirror as CodeMirror } from 'vue-codemirror'
  import { basicSetup } from 'codemirror'
  import { json } from '@codemirror/lang-json'
  import { create, list, del, debugContent, getByName } from '@/api/pipeline'
  import type { PipeFile } from '@/api/pipeline'

  const emit = defineEmits(['refresh', 'del'])
  const props = defineProps<{
    filename: undefined | string
  }>()

  const currFile = reactive<PipeFile>({
    name: '',
    content: `processors:
  - dissect:
      fields:
        - message
      patterns:
        - '%{ip} - %{user} [%{datetime}] "%{method} %{path} %{protocol}" %{status} %{size}'
  - date:
      fields:
        - datetime
      formats:
        - "%d/%b/%Y:%H:%M:%S %z"
transform:
  - fields:
      - message
      - ip
      - user
      - method
      - path
      - protocol
    type: string
  - fields:
      - status
      - size
    type: int64
  - fields:
      - datetime
    type: timestamp
    index: timestamp`,
    version: '',
  })

  const route = useRoute()
  const isCreating = computed(() => {
    return !props.filename
  })

  const formRef = ref()

  const appStore = useAppStore()

  const handleSave = () => {
    formRef.value?.validate((error: any) => {
      if (error) {
        return error
      }
      return create(currFile)
        .then(() => {
          Notification.success('Save Successful')
          emit('refresh')
        })
        .then(() => {
          getByName(currFile.name).then((fileResult) => {
            Object.assign(currFile, fileResult)
          })
        })
    })
  }

  const handleDelete = () => {
    del(currFile.name, currFile.version).then(() => {
      emit('del')
    })
  }

  const rules = {
    name: [
      {
        required: true,
      },
    ],
    content: [
      {
        required: true,
      },
    ],
  }

  const debugForm = reactive({
    content:
      '210.207.142.115 - AnthraX [26/Dec/2024:16:47:19 +0800] "DELETE /do-not-access/needs-work HTTP/2.0" 200 4488',
  })

  const selectedContentType = ref('text/plain')
  // Watch for content changes to auto-detect content type
  watch(
    () => debugForm.content,
    (newContent) => {
      try {
        JSON.parse(newContent)
        selectedContentType.value = 'application/json'
      } catch (e) {
        // If content contains newlines and each line is valid JSON, it's NDJSON
        if (newContent.includes('\n')) {
          const lines = newContent.split('\n').filter((line) => line.trim())
          const isNDJSON = lines.every((line) => {
            try {
              JSON.parse(line)
              return true
            } catch {
              return false
            }
          })
          if (isNDJSON) {
            selectedContentType.value = 'application/x-ndjson'
          } else {
            selectedContentType.value = 'text/plain'
          }
        } else {
          selectedContentType.value = 'text/plain'
        }
      }
    }
  )

  const extensions = [basicSetup, json()]
  const debugResponse = ref('')
  function handleDebug() {
    debugContent(currFile.content, debugForm.content, selectedContentType.value).then((result) => {
      debugResponse.value = JSON.stringify(result, null, 2)
    })
  }

  const ymlError = ref('')

  function getData() {
    const name = props.filename
    if (name) {
      getByName(name).then((result) => {
        Object.assign(currFile, result)
      })
    }
  }
  getData()
</script>

<style lang="less" scoped>
  :deep(.arco-card) {
    border-radius: 0;
    border-bottom: none;
  }
  .right-content {
    padding: 0 10px 10px 10px;
    height: 100%;
    display: flex;
    flex-direction: column;
  }
  :deep(.arco-card.light-editor-card) {
    padding-right: 0;
    flex: 1;
    display: flex;
    flex-direction: column;
    min-height: 0;
  }
  :deep(.arco-layout-sider-light) {
    box-shadow: none;
  }
  :deep(.arco-form-item-content-flex) {
    display: block;
  }

  .content-container {
    height: 100%;
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .input-editor,
  .output-editor {
    flex: 1;
    min-height: 0;
    margin-top: 5px;

    :deep(.cm-editor) {
      height: 100%;
    }
  }

  .output-editor {
    :deep(.cm-editor) {
      background-color: var(--color-fill-2);
      cursor: not-allowed;
    }

    :deep(.cm-content) {
      color: var(--color-text-2);
    }
  }

  .form-description {
    color: var(--color-text-3);
    font-size: 14px;
    margin-bottom: 16px;
  }

  .full-height-layout {
    height: calc(100vh - 133px); // Subtract header height and alert height

    :deep(.arco-layout) {
      height: 100%;
    }

    :deep(.arco-layout-content) {
      height: 100%;
      overflow: auto;
    }

    :deep(.arco-layout-sider) {
      height: 100%;
      overflow: auto;
      overflow-x: hidden; // Prevent horizontal scrollbar
    }

    :deep(.arco-card-body) {
      padding: 0; // Remove default padding that might cause overflow
      height: 100%;
    }
  }

  .editor-container {
    min-height: 300px; // Set a minimum height
  }

  // Add styles for editor borders
  :deep(.cm-editor) {
    border: 1px solid var(--color-border);
    border-radius: 4px;
  }

  :deep(.editor-container) {
    .cm-editor {
      border: 1px solid var(--color-border);
      border-radius: 4px;
    }
  }
  :deep(.cm-editor.cm-focused) {
    outline: 0;
  }
</style>
