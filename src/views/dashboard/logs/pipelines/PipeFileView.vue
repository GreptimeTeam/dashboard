<template lang="pug">
a-layout.full-height-layout.pipefile-view
  a-layout-sider(style="width: 50%" :resize-directions="['right']")
    a-card.light-editor-card(:bordered="false")
      template(#title)
        .card-title-with-description
          .card-title {{ isCreating ? `${t('common.create')} Pipeline` : `${t('common.edit')} Pipeline - ${currFile.name}` }}
          .card-description Pipeline is a mechanism in GreptimeDB for parsing and transforming log data,
            |
            a(href="https://docs.greptime.com/reference/pipeline/pipeline-config" target="_blank") read more
      template(#extra)
        a-space
          a-popconfirm(content="Are you sure you want to delete?" @ok="handleDelete")
            a-button(
              v-if="!isCreating"
              type="text"
              status="danger"
              size="small"
            )
              | {{ t('common.delete') }}
          a-button(type="primary" size="small" @click="handleSave")
            | {{ t('common.save') }}
    a-card.pipeline-actions-card(v-if="!isCreating")
      a-button(type="text" size="small" @click="handleIngest")
        | Ingest With Pipeline
      a-button(type="text" size="small" @click="showCreateTableModal")
        | Create Table from Pipeline

    a-form(
      ref="formRef"
      layout="vertical"
      :model="currFile"
      :rules="rules"
    )
      a-form-item(
        v-if="isCreating"
        field="name"
        label="Pipeline name"
        style="width: 200px; padding: 8px"
      )
        a-input(v-model="currFile.name" placeholder="Pipeline name")
      a-form-item(
        v-if="!isCreating"
        field="version"
        label="Version"
        style="padding: 8px"
      )
        a-space
          | {{ currFile.version }}

      a-form-item.pipeline-content-item(field="content" label="Yaml Content")
        template(#help)
          div
        .full-width-height-editor.pipeline-editor(:class="editorHeightClass")
          LangEditor(v-model="currFile.content" style="width: 100%; height: 100%")
  a-layout-content.content-wrapper
    a-card.light-editor-card(title="Input" :bordered="false")
      template(#extra)
        a-space
          a-select(
            v-model="selectedContentType"
            style="width: 150px"
            placeholder="Content Type"
            size="small"
            @change="handleInputChange"
          )
            a-option(value="text/plain") text
            a-option(value="application/json") json
            a-option(value="application/x-ndjson") ndjson

          a-button(size="small" type="primary" @click="handleDebug") {{ t('pipeline.test') }}

      template(#title)
        .card-title-with-description
          .card-title Input
          .card-description Input your original log for processing by the current pipeline configuration

      a-alert(v-if="ymlError" type="error")
        | {{ ymlError }}
      .full-width-height-editor.pipeline-side-editor
        CodeMirror(
          v-model="debugForm.content"
          style="width: 100%; height: 100%"
          :extensions="extensions"
          :spellcheck="true"
          :autofocus="true"
          :indent-with-tab="true"
          :tabSize="2"
        )

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
        style="height: 100%; display: flex; align-items: center; justify-content: center; flex: 1"
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
      .full-width-height-editor.pipeline-side-editor(
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
  CreateTableModal(ref="createTableModalRef" :pipeline-name="currFile.name")
</template>

<script setup name="PipeFileView" lang="ts">
  import { Notification } from '@arco-design/web-vue'
  import { Codemirror as CodeMirror } from 'vue-codemirror'
  import { basicSetup } from 'codemirror'
  import { json } from '@codemirror/lang-json'
  import { useI18n } from 'vue-i18n'
  import { create, list, del, debugContent, getByName } from '@/api/pipeline'
  import type { PipeFile } from '@/api/pipeline'
  import type { ColumnType } from '@/types/query'
  import router from '@/router'
  import DataTable from '@/components/data-table/index.vue'
  import LangEditor from '@/components/lang-editor.vue'
  import CreateTableModal from './create-table-modal/index.vue'
  import { toObj } from '../query/until'

  const { t } = useI18n()

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

  const schemaMapping = {
    TIMESTAMP_SECOND: 'TimestampSecond',
    TIMESTAMP_MILLISECOND: 'TimestampMillisecond',
    TIMESTAMP_MICROSECOND: 'TimestampMicrosecond',
    TIMESTAMP_NANOSECOND: 'TimestampNanosecond',
  }
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
        data_type: schemaMapping[col.data_type] || col.data_type || 'String',
        semantic_type: col.column_type,
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
  .pipefile-view {
    height: calc(100vh - 24px);
    background: var(--gpt-bg-app);
    font-size: 13px;
  }

  .pipefile-view :deep(.arco-resizebox-trigger-vertical) {
    width: 1px;
    background: var(--gpt-border-strong);

    &::before,
    &::after {
      display: none;
    }
  }

  .pipefile-view :deep(.arco-layout-sider-children) {
    height: auto;
    overflow: visible;
  }

  .content-wrapper {
    display: flex;
    flex-direction: column;
    min-width: 0;
    padding-bottom: 0;

    :deep(.arco-card-body) {
      padding: 0;
      overflow: hidden;
    }
  }

  // ===================
  // EDITOR COMPONENTS
  // ===================
  .full-width-height-editor.pipeline-editor {
    height: calc(100vh - 195px);

    &.editing {
      height: calc(100vh - 241px);
    }
  }

  // ===================
  // CARD COMPONENTS
  // ===================
  .light-editor-card {
    display: flex;
    flex-direction: column;
    background: var(--gpt-bg-panel);
    border-radius: 0;

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

  .card-title-with-description {
    overflow: hidden;

    .card-title {
      margin-bottom: 2px;
      color: var(--gpt-text-primary);
      font-size: 13px;
      font-weight: 700;
      line-height: 18px;
    }

    .card-description {
      color: var(--gpt-text-secondary);
      font-size: 11px;
      font-weight: normal;
      line-height: 16px;
      overflow: hidden;
      text-overflow: ellipsis;
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
  }

  .semantic-legend {
    display: flex;
    align-items: center;
    gap: 16px;
    margin-bottom: 12px;
    margin-top: 12px;
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
    height: auto;
    min-height: 0;
    padding: 7px 10px;
    border-bottom: 1px solid var(--gpt-border-default);
    background: var(--gpt-bg-panel);
  }

  .light-editor-card :deep(.arco-card-size-medium .arco-card-header) {
    height: auto;
  }

  .light-editor-card :deep(.arco-card-header-title) {
    min-width: 0;
  }

  .light-editor-card :deep(.arco-card-header-extra) {
    flex-shrink: 0;
  }

  .full-width-height-editor :deep(.cm-editor) {
    border-right: 0;
    border-left: 0;
  }

  .pipeline-side-editor :deep(.cm-editor) {
    border-top: 0;
  }

  .section-divider {
    height: 1px;
    margin: 0;
    background: var(--gpt-border-default);
    border: none;
    position: relative;
  }

  // ===================
  // PIPELINE ACTIONS CARD
  // ===================
  .pipeline-actions-card {
    margin: 0;
    padding: 0;
    background: var(--gpt-bg-header);
    border-top: 0;
    border-bottom: 1px solid var(--gpt-border-default);
    border-radius: 0;

    :deep(.arco-card-body) {
      display: flex;
      gap: 8px;
      padding: 10px;
    }
  }

  .pipeline-actions-card :deep(.arco-btn) {
    border-color: var(--gpt-border-strong);
    color: var(--gpt-text-primary);
    background: var(--gpt-bg-panel);
  }

  .pipeline-actions-card :deep(.arco-btn:hover) {
    color: var(--gpt-brand-900);
    background: var(--gpt-nav-active-bg);
  }

  .pipeline-content-item :deep(.arco-form-item-label-col) {
    padding: 8px;
    background: var(--gpt-bg-header);
  }

  .pipeline-content-item :deep(.arco-form-item-wrapper-col) {
    position: relative;
  }

  .pipeline-content-item :deep(.arco-form-item-message) {
    position: absolute;
    top: -26px;
    right: 8px;
    margin: 0;
    line-height: 16px;
    text-align: right;
  }

  :deep(.arco-form-item-layout-vertical > .arco-form-item-label-col) {
    margin-bottom: 0;
  }
</style>
