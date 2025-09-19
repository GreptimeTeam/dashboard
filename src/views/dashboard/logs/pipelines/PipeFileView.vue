<template lang="pug">
a-layout.full-height-layout.pipefile-view(
  style="box-shadow: 0 2px 5px 0 rgba(0, 0, 0, 0.08); height: calc(100vh - 30px)"
)
  a-layout-sider(style="width: 45%" :resize-directions="['right']")
    a-card.light-editor-card(:bordered="false")
      template(#title)
        .card-title-with-description
          .card-title {{ isCreating ? 'Create Pipeline' : `Edit Pipeline - ${currFile.name}` }}
          .card-description Pipeline is a mechanism in GreptimeDB for parsing and transforming log data,
            |
            a(href="https://docs.greptime.com/user-guide/logs/pipeline-config" target="_blank") read more
      template(#extra)
        a-space
          a-popconfirm(content="Are you sure you want to delete?" @ok="handleDelete")
            a-button(
              v-if="!isCreating"
              type="text"
              status="warning"
              size="small"
            )
              | Delete
          a-button(type="primary" size="small" @click="handleSave")
            | Save
    a-card.pipeline-actions-card(v-if="!isCreating")
      a-button(type="text" size="small" @click="handleIngest") 
        | Ingest With Pipeline
      a-button(type="text" size="small" @click="showCreateTableModal")
        | Create Table from Pipeline

    a-form(
      ref="formRef"
      layout="vertical"
      style="padding: 10px 10px 0 10px"
      :model="currFile"
      :rules="rules"
    )
      a-form-item(
        v-if="isCreating"
        field="name"
        label="Pipeline name"
        style="width: 200px"
      )
        a-input(v-model="currFile.name" placeholder="Pipeline name")
      a-form-item(v-if="!isCreating" field="version" label="Version")
        a-space
          | {{ currFile.version }}

      a-form-item(field="content" label="Yaml Content")
        template(#help)
          div 
        .full-width-height-editor.pipeline-editor(:class="editorHeightClass")
          YMLEditorSimple(v-model="currFile.content" style="width: 100%; height: 100%")
  a-layout-content.content-wrapper(style="display: flex; flex-direction: column; padding-bottom: 22px")
    a-card.light-editor-card(title="Input" :bordered="false")
      template(#extra)
        a-space
          a-select(
            v-model="selectedContentType"
            style="width: 150px"
            placeholder="Content Type"
            @change="handleInputChange"
          )
            a-option(value="text/plain") text
            a-option(value="application/json") json
            a-option(value="application/x-ndjson") ndjson

          a-button(size="small" type="primary" @click="handleDebug") Test

      template(#title)
        .card-title-with-description
          .card-title Input
          .card-description Input your original log for processing by the current pipeline configuration

      a-alert(v-if="ymlError" type="error")
        | {{ ymlError }}
      .full-width-height-editor
        CodeMirror(
          v-model="debugForm.content"
          style="width: 100%; height: 100%"
          :extensions="extensions"
          :spellcheck="true"
          :autofocus="true"
          :indent-with-tab="true"
          :tabSize="2"
        )
    .section-divider
    a-card.light-editor-card.output(title="Output" :bordered="false")
      template(#extra)
        a-radio-group.output-view-toggle(v-model="outputViewMode" type="button" size="small")
          a-radio(value="table") Table
          a-radio(value="json") JSON

      template(#title)
        .card-title-with-description
          .card-title Output
          .card-description Processed logs displayed here. Logs that ingested via API will follow this structure.

      // Semantic Type Legend
      .semantic-legend(
        v-if="outputViewMode === 'table' && parsedOutputData.records && parsedOutputData.records.rows.length > 0"
      )
        .legend-items
          .legend-item
            .legend-color.field
            .legend-label Field
          .legend-item
            .legend-color.tag
            .legend-label Tag
          .legend-item
            .legend-color.timestamp
            .legend-label Timestamp

      a-empty(
        v-if="parsedOutputData.records && parsedOutputData.records.rows.length === 0"
        style="border: 1px solid var(--color-border); border-radius: 2px; height: 100%; display: flex; align-items: center; justify-content: center; flex: 1"
        description="No parsed data. Click Test to see results."
      )

      // Table View
      .output-table(
        v-if="outputViewMode === 'table' && parsedOutputData.records && parsedOutputData.records.rows.length > 0"
      )
        DataTable(
          :data="tableData"
          :columns="tableColumns"
          :loading="false"
          :show-context-menu="false"
          :wrap-line="true"
        )

      // JSON View  
      .full-width-height-editor(
        v-if="outputViewMode === 'json' && parsedOutputData.records && parsedOutputData.records.rows.length > 0"
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

  // Create Table Modal
  CreateTableModal(ref="createTableModalRef" :pipeline-name="currFile.name" @tableCreated="() => {}")
</template>

<script setup name="PipeFileView" lang="ts">
  import { Notification } from '@arco-design/web-vue'
  import { Codemirror as CodeMirror } from 'vue-codemirror'
  import { basicSetup } from 'codemirror'
  import { json } from '@codemirror/lang-json'
  import { create, list, del, debugContent, getByName } from '@/api/pipeline'
  import type { PipeFile } from '@/api/pipeline'
  import type { ColumnType } from '@/types/query'
  import router from '@/router'
  import DataTable from '@/components/data-table/index.vue'
  import YMLEditorSimple from '@/components/yml-editor.vue'
  import CreateTableModal from './create-table-modal/index.vue'
  import { toObj } from '../query/until'

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

  const formRef = ref()

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
    'application/json': JSON.stringify([{ message: defaultContent }, { message: defaultContent }], null, 2),
    'application/x-ndjson': `{"message": "${defaultJsonContent}"}\n{"message": "${defaultJsonContent}"}`,
  }

  const debugForm = reactive({
    content: defaultContentExamples[selectedContentType.value],
  })

  const handleInputChange = (type: string) => {
    debugForm.content = defaultContentExamples[type]
  }

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

  // DataTable specific variables
  const tableData = ref<Array<any>>([])
  const tableColumns = ref<Array<ColumnType>>([])

  function handleDebug() {
    debugContent(currFile.content, debugForm.content, selectedContentType.value).then((result) => {
      debugResponse.value = JSON.stringify(result[0], null, 2)
      const rows = result[0].rows.map((row) => {
        return row.map((item) => {
          return item.value
        })
      })
      const schema = result[0].schema || []

      // Parse response for DataGrid format (keep for compatibility)
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

      // Update DataTable format
      const schemas = schema.map((col) => ({
        name: col.name,
        title: col.name,
        data_type: col.data_type || 'String',
        semantic_type: col.colume_type,
      }))

      tableColumns.value = schemas
      tableData.value = rows.map((row, index) => {
        return toObj(row, schemas, index, null)
      })
    })
  }

  const ymlError = ref('')

  const createTableModalRef = ref()

  function getData() {
    const name = props.filename
    if (name) {
      getByName(name).then((result) => {
        Object.assign(currFile, result)
      })
    }
  }
  getData()

  const handleIngest = () => {
    router.push({
      name: 'log-ingestion-input',
      query: {
        pipeline: currFile.name,
      },
    })
  }

  // Show create table modal
  const showCreateTableModal = () => {
    if (createTableModalRef.value?.open) {
      createTableModalRef.value.open()
    }
  }
</script>

<style lang="less" scoped>
  .content-wrapper {
    :deep(.arco-card-body) {
      padding: 10px 10px 0 10px;
      overflow: hidden;
    }
  }

  // ===================
  // EDITOR COMPONENTS
  // ===================
  .full-width-height-editor.pipeline-editor {
    height: calc(100vh - 238px); // Taller for creating mode (no version field)

    &.editing {
      height: calc(100vh - 298px); // Shorter for editing mode (has version field)
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
      overflow: hidden; // Prevent content from expanding card
    }
    :deep(.arco-card-header) {
      flex-shrink: 0;
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

  .output-table {
    overflow: auto;
    flex: 1;
    border: 1px solid var(--color-border);
    border-radius: 2px;
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
  .card-title-with-description {
    overflow: hidden;
    .card-title {
      font-size: 16px;
      font-weight: 600;
      color: var(--color-text-1);
      margin-bottom: 4px;
    }

    .card-description {
      font-size: 13px;
      color: var(--color-text-2);
      line-height: 1.4;
      font-weight: normal;
      text-overflow: ellipsis;
      overflow: hidden;
    }
  }

  // ===================
  // SEMANTIC TYPE STYLES
  // ===================

  // Define semantic type colors as CSS variables at component level
  .pipefile-view {
    --semantic-field-bg: #f6ffed;
    --semantic-field-text: #36b174;
    --semantic-field-legend: #36b174;

    --semantic-tag-bg: #fff7e6;
    --semantic-tag-text: #e1b84d;
    --semantic-tag-legend: #e1b84d;

    --semantic-timestamp-bg: #e6f4ff;
    --semantic-timestamp-text: #417aff;
    --semantic-timestamp-legend: #417aff;
    font-size: 13px;
  }

  .semantic-legend {
    display: flex;
    align-items: center;
    gap: 16px;
    margin-bottom: 12px;
    justify-content: flex-end;

    .legend-title {
      font-size: 12px;
      font-weight: 600;
      color: var(--color-text-2);
    }

    .legend-items {
      display: flex;
      gap: 16px;
    }

    .legend-item {
      display: flex;
      align-items: center;
      gap: 6px;

      .legend-color {
        width: 12px;
        height: 12px;
        border-radius: 2px;
        border: 1px solid var(--color-border-3);

        &.field {
          background-color: var(--semantic-field-legend);
        }

        &.tag {
          background-color: var(--semantic-tag-legend);
        }

        &.timestamp {
          background-color: var(--semantic-timestamp-legend);
        }
      }

      .legend-label {
        font-size: 12px;
        color: var(--color-text-2);
      }
    }
  }

  .output-table {
    :deep(.arco-table-th-title) {
      .timestamp {
        background-color: var(--semantic-timestamp-bg);
        color: var(--semantic-timestamp-text);
        padding: 2px 4px;
      }

      .field {
        background-color: var(--semantic-field-bg);
        color: var(--semantic-field-text);
        padding: 2px 4px;
      }

      .tag {
        background-color: var(--semantic-tag-bg);
        color: var(--semantic-tag-text);
        padding: 2px 4px;
      }
    }
    :deep(.arco-table-size-medium .arco-table-td) {
      font-size: 13px;
    }
  }
  .light-editor-card :deep(.arco-card-header) {
    border-bottom: 1px solid var(--color-border);
    height: 70px;
  }
  .section-divider {
    height: 6px;
    background: var(--color-neutral-3);
    border: none;
    margin: 10px 0 0;
    position: relative;
  }

  // ===================
  // PIPELINE ACTIONS CARD
  // ===================
  .pipeline-actions-card {
    border: 1px solid var(--color-border-2);
    border-radius: 4px;
    margin: 10px 10px 0 10px;
    padding: 10px 2px;

    :deep(.arco-card-body) {
      padding: 0;
    }
  }
</style>
