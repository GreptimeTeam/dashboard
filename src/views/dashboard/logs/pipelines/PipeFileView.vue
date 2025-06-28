<template lang="pug">
.page-container
  .page-header-container
    .page-header-2 {{ isCreating ? 'Create Pipeline' : `Edit Pipeline: ${currFile.name}` }}
    .page-description Pipeline is a mechanism in GreptimeDB for parsing and transforming log data,
      |
      a(href="https://docs.greptime.com/user-guide/logs/pipeline-config" target="_blank") read more
  a-layout.full-height-layout(style="box-shadow: 0 2px 5px 0 rgba(0, 0, 0, 0.08)")
    a-layout-sider(:resize-directions="['right']" :width="800")
      a-card.light-editor-card(title="Pipeline" :bordered="false")
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
          .editor-container(:class="editorHeightClass")
            YMLEditorSimple(v-model="currFile.content" style="width: 100%; height: 100%")
    a-layout-content.content-wrapper(
      style="display: flex; flex-direction: column; height: 100%; gap: 16px; padding-bottom: 24px"
    )
      a-card.light-editor-card(title="Input" :bordered="false")
        template(#extra)
          a-space
            a-button(size="small" @click="handleDebug") Test
            a-select(v-model="selectedContentType" style="width: 150px" placeholder="Content Type")
              a-option(value="text/plain") text
              a-option(value="application/json") json
              a-option(value="application/x-ndjson") ndjson

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
          )

      a-card.light-editor-card(title="Output" :bordered="false")
        template(#extra)

        .output-header
          a-typography-text(type="secondary")
            | Parsed logs displayed here. Logs that ingested via API will follow this structure.
          a-radio-group.output-view-toggle(v-model="outputViewMode" type="button" size="small")
            a-radio(value="table") Table
            a-radio(value="json") JSON

        a-empty(
          v-if="parsedOutputData.records && parsedOutputData.records.rows.length === 0"
          style="border: 1px solid var(--color-border); border-radius: 6px; height: 100%; display: flex; align-items: center; justify-content: center; margin-top: 8px; flex: 1"
          description="No parsed data. Click Test to see results."
        )

        // Table View
        .output-table(
          v-if="outputViewMode === 'table' && parsedOutputData.records && parsedOutputData.records.rows.length > 0"
        )
          DataGrid(:data="parsedOutputData" :has-header="false")

        // JSON View  
        .input-editor(
          v-if="outputViewMode === 'json' && parsedOutputData.records && parsedOutputData.records.rows.length > 0"
          style="margin-bottom: 20px"
        )
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
  import DataGrid from '@/views/dashboard/modules/data-view/components/data-grid.vue'

  const emit = defineEmits(['refresh', 'del'])
  const props = defineProps<{
    filename: undefined | string
  }>()

  const isCreating = computed(() => !props.filename)

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

  const selectedContentType = ref('text/plain')

  // Default content examples for different content types
  const defaultContent =
    '210.207.142.115 - AnthraX [26/Dec/2024:16:47:19 +0800] "DELETE /do-not-access/needs-work HTTP/2.0" 200 4488'
  const defaultJsonContent =
    '210.207.142.115 - AnthraX [26/Dec/2024:16:47:19 +0800] \\"DELETE /do-not-access/needs-work HTTP/2.0\\" 200 4488'
  const defaultContentExamples = {
    'text/plain': defaultContent,
    'application/json': `{"message": "${defaultJsonContent}"}`,
    'application/x-ndjson': `{"message": "${defaultJsonContent}"}\n{"message": "${defaultJsonContent}"}`,
  }

  const debugForm = reactive({
    content: defaultContentExamples[selectedContentType.value],
  })

  // Update content when content type changes
  watch(selectedContentType, (newType) => {
    debugForm.content = defaultContentExamples[newType]
  })

  // Watch for content changes to auto-detect content type
  watch(
    () => debugForm.content,
    (newContent) => {
      // Skip auto-detection if content matches one of our default examples
      if (Object.values(defaultContentExamples).includes(newContent)) {
        return
      }

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

  const editorHeightClass = computed(() => {
    return isCreating.value ? 'creating' : 'editing'
  })

  const outputViewMode = ref('table')
  const parsedOutputData = ref({
    records: {
      rows: [],
      schema: {
        column_schemas: [],
      },
    },
    dimensionsAndXName: {
      dimensions: [],
      xAxis: '',
    },
    key: 0,
    type: 'table',
  })

  function handleDebug() {
    debugContent(currFile.content, debugForm.content, selectedContentType.value).then((result) => {
      debugResponse.value = JSON.stringify(result[0], null, 2)
      console.log(result)
      const rows = result[0].rows.map((row) => {
        return row.map((item) => {
          return item.value
        })
      })
      console.log(rows)
      const schema = result[0].schema || []

      // Parse response for DataGrid format
      parsedOutputData.value = {
        records: {
          rows,
          schema: {
            column_schemas: schema.map((col) => ({
              name: col.name,
              data_type: col.data_type || 'String',
            })),
          },
        },
        dimensionsAndXName: {
          dimensions: schema.map((col) => col.name),
          xAxis: schema.length > 0 ? schema[0].name : '',
        },
        key: Date.now(),
        type: 'table',
      }
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
  // ===================
  // PAGE LAYOUT
  // ===================
  .page-container {
    height: calc(100vh - 30px);
    display: flex;
    flex-direction: column;
  }

  .page-header-container {
    display: flex;
    align-items: baseline;
    gap: 16px;
    border-bottom: 1px solid var(--color-border);
    flex-shrink: 0;
  }

  .page-header-2 {
    font-size: 16px;
    font-weight: 600;
    color: var(--color-text-1);
    padding: 0 12px;
    margin-bottom: 0;
    border-bottom: none;
    background-color: transparent;
    flex-shrink: 0;
    height: 58px;
    line-height: 58px;
  }

  .page-description {
    flex: 1;
    color: var(--color-text-3);
    font-size: 14px;
    line-height: 1.5;

    a {
      color: var(--color-primary);
      text-decoration: none;

      &:hover {
        text-decoration: underline;
      }
    }
  }

  .full-height-layout {
    flex: 1;
    min-height: 0;
  }

  .content-wrapper {
    :deep(.arco-card-body) {
      padding: 10px 10px 0 10px;
    }
  }

  // ===================
  // EDITOR COMPONENTS
  // ===================
  .editor-container {
    min-height: 300px;
    height: calc(100vh - 343px); // Taller for creating mode (no version field)

    &.editing {
      height: calc(100vh - 422px); // Shorter for editing mode (has version field)
    }
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

  // ===================
  // CARD COMPONENTS
  // ===================
  .light-editor-card {
    display: flex;
    flex-direction: column;

    :deep(.arco-card-body) {
      flex: 1;
      display: flex;
      flex-direction: column;
      height: 100%;
    }

    .input-editor {
      margin-top: 8px;
      border: 1px solid var(--color-border);
      border-radius: 6px;
      overflow: hidden;
    }
  }

  // ===================
  // OUTPUT SECTION
  // ===================
  .output-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 8px;
  }

  .output-view-toggle {
    width: auto !important;
    display: inline-flex !important;
    flex-shrink: 0 !important;
    align-self: flex-start !important;
  }

  // ===================
  // FORM ELEMENTS
  // ===================
  .form-description {
    color: var(--color-text-3);
    font-size: 14px;
    margin-bottom: 16px;
  }

  // ===================
  // ARCO DESIGN OVERRIDES
  // ===================
  :deep(.arco-card) {
    border-radius: 0;
    border-bottom: none;
  }

  :deep(.arco-card.light-editor-card) {
    flex: 1;
    min-height: 0;
    overflow: hidden;
  }

  :deep(.arco-radio-button.arco-radio-checked) {
    color: var(--color-primary);
  }

  :deep(.cm-editor) {
    border-radius: 4px;

    &.cm-focused {
      outline: 0;
    }
  }

  :deep(.editor-container) {
    .cm-editor {
      border: 1px solid var(--color-border);
      border-radius: 4px;
    }
  }
</style>
