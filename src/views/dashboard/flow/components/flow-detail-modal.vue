<template lang="pug">
a-drawer.custom-drawer(
  v-model:visible="visible"
  popup-container=".query-layout"
  :width="900"
  :mask="true"
  :mask-closable="true"
  :hide-cancel="true"
  @cancel="handleCancel"
)
  template(#title)
    span(v-if="isEdit") {{ $t('flow.editFlow') }}&nbsp;
      strong {{ formData.flow_name }}
    span(v-else) {{ $t('flow.createTitle') }}
  .flow-detail-container
    // System information (always visible at top in edit mode)
    template(v-if="isEdit")
      a-descriptions(
        bordered
        size="medium"
        layout="inline-horizontal"
        style="margin-bottom: 24px"
        :column="2"
      )
        a-descriptions-item(label="Flow ID")
          | {{ formData.flow_id || '-' }}
        a-descriptions-item(:label="$t('flow.stateSize')")
          | {{ formData.state_size || '-' }}
        a-descriptions-item(:label="$t('flow.sourceTableNames')" :span="2")
          | {{ formData.source_table_names || '-' }}
        a-descriptions-item(:label="$t('flow.sourceTableIds')" :span="2")
          | {{ formData.source_table_ids || '-' }}
        a-descriptions-item(:label="$t('flow.createdTime')")
          | {{ formData.created_time ? renderTs(formData.created_time, schemaColumns.find((col) => col.name === 'created_time')?.data_type) : '-' }}
        a-descriptions-item(:label="$t('flow.updatedTime')")
          | {{ formData.updated_time ? renderTs(formData.updated_time, schemaColumns.find((col) => col.name === 'updated_time')?.data_type) : '-' }}
        a-descriptions-item(:label="$t('flow.lastExecution')")
          | {{ formData.last_execution_time ? renderLastExecution(formData.last_execution_time) : '-' }}
    .gpt-drawer-mode-bar
      a-radio-group(v-model="editorMode" type="button" size="small")
        a-radio(value="form") {{ $t('flow.formMode') }}
        a-radio(value="text") {{ $t('flow.rawMode') }}
      a-button(
        v-if="isEdit"
        type="outline"
        size="small"
        @click="handleCloneFlow"
      )
        icon-copy(style="margin-right: 4px")
        | {{ $t('flow.clone') }}

    // Form mode
    template(v-if="editorMode === 'form'")
      a-form(layout="vertical" :model="formData")
        a-row(:gutter="16")
          a-col(v-if="!isEdit" :span="12")
            a-form-item(field="flow_name" required :label="$t('flow.name')")
              a-input(v-model="formData.flow_name" :placeholder="$t('flow.namePlaceholder')")
          a-col(:span="12")
            a-form-item(field="sink_table_name" required :label="$t('flow.sinkTable')")
              a-select(
                v-model="formData.sink_table_name"
                style="width: 100%"
                :placeholder="$t('flow.sinkTablePlaceholder')"
                :allow-search="true"
                :allow-create="true"
                :loading="tablesLoading"
                :trigger-props="{ autoFitPopupMinWidth: true }"
                :options="originTablesTree.map((table) => ({ label: table.title, value: table.title }))"
              )
              | &nbsp;
              a-button(type="text" :loading="creatingTable" @click="showCreateTableModal")
                | {{ $t('flow.createSinkTable') }}

        a-row(:gutter="16")
          a-col(:span="12")
            a-form-item(field="expire_after" :label="$t('flow.expireAfter')")
              a-input(v-model="formData.expire_after" :placeholder="$t('flow.expireAfterPlaceholder')")
          a-col(:span="12")
            a-form-item(v-if="!isEdit" field="ifNotExists" :label="$t('flow.options')")
              a-checkbox(v-model="formData.ifNotExists") IF NOT EXISTS

        a-form-item(field="comment" :label="$t('flow.comment')")
          a-input(v-model="formData.comment" :placeholder="$t('flow.commentPlaceholder')" :rows="2")

        a-form-item(field="flow_definition" required :label="$t('flow.definition')")
          LangEditor.gpt-code-editor-frame.gpt-code-editor-frame--h200(
            v-model="formData.flow_definition"
            language="sql"
            :placeholder="defaultFlowDefinitionPlaceholder"
          )

    // Text editor mode  
    template(v-else)
      .editable-fields-section
        a-form(layout="vertical" :model="textEditorData")
          a-form-item(field="content" :label="$t('flow.statement')")
            a-spin(style="width: 100%" :loading="fetchingFlowSQL")
              LangEditor.gpt-code-editor-frame.gpt-code-editor-frame--h500(
                v-model="textEditorData.content"
                language="sql"
                :placeholder="defaultTextEditorPlaceholder"
              )

  template(#footer)
    .drawer-footer
      a-space
        a-button(@click="handleCancel") {{ $t('common.cancel') }}
        a-button(
          type="primary"
          :loading="loading"
          @click="editorMode === 'form' ? handleSubmit() : handleTextSubmit()"
        )
          | {{ isEdit ? $t('flow.updateFlow') : $t('flow.createTitle') }}

  // Create Table Modal
  a-modal(
    v-model:visible="createTableModalVisible"
    :title="$t('flow.createSinkTable')"
    :width="700"
    @ok="createTable"
    @cancel="createTableModalVisible = false"
  )
    template(#footer)
      a-space
        a-button(@click="createTableModalVisible = false") {{ $t('common.cancel') }}
        a-button(type="primary" :loading="creatingTable" @click="createTable") {{ $t('flow.createTable') }}

    .create-table-content
      p {{ $t('flow.sinkTableHint') }}

      LangEditor.gpt-code-editor-frame.gpt-code-editor-frame--h300(
        v-model="createTableSQL"
        language="sql"
        :placeholder="defaultCreateTableSQL"
      )
</template>

<script setup lang="ts">
  import { ref, reactive, watch, computed } from 'vue'
  import { Message } from '@arco-design/web-vue'
  import { storeToRefs } from 'pinia'
  import { useI18n } from 'vue-i18n'
  import LangEditor from '@/components/lang-editor.vue'
  import editorAPI from '@/api/editor'
  import { useAppStore } from '@/store'
  import type { ColumnType } from '@/types/query'
  import { convertTimestampToMilliseconds } from '@/utils/date-time'
  import { useDateTimeFormat } from '@/hooks'

  const { t } = useI18n()
  const { formatDateTime, formatDateTimeWithMs } = useDateTimeFormat()

  interface Props {
    visible: boolean
    editData?: any
    rawData?: string
    schemaColumns?: ColumnType[]
  }

  interface Emits {
    (e: 'update:visible', value: boolean): void
    (e: 'clone', data: { formData: any; rawData: string }): void
    (e: 'saved', data: { success: boolean; message?: string; mode: string }): void
  }

  const props = withDefaults(defineProps<Props>(), {
    visible: false,
    editData: null,
    rawData: '',
  })

  const emit = defineEmits<Emits>()

  // Editor mode: 'form' or 'text', default to 'text' if rawData is provided
  const editorMode = ref('form')
  const loading = ref(false)
  const fetchingFlowSQL = ref(false)

  // Edit mode: calculated from editData initially, false if rawData is provided (for cloning)
  const isEdit = ref(!!props.editData?.flow_id)

  // Get current database from app store
  const { tableCatalog, tableSchema, database } = storeToRefs(useAppStore())

  const { originTablesTree, tablesLoading } = storeToRefs(useDataBaseStore())
  const { getTables } = useDataBaseStore()
  // Table creation state
  const createTableModalVisible = ref(false)
  const creatingTable = ref(false)
  const createTableSQL = ref('')

  // Default placeholder for SQL editors
  const defaultFlowDefinitionPlaceholder = `SELECT
  max(temperature) as max_temp,
  date_bin('10 seconds'::INTERVAL, ts) as time_window
FROM temp_sensor_data
GROUP BY time_window`

  const defaultTextEditorPlaceholder = `CREATE FLOW IF NOT EXISTS my_flow
SINK TO my_sink_table
EXPIRE AFTER '1 hour'::INTERVAL
COMMENT 'My flow description'
AS
SELECT
  max(temperature) as max_temp,
  date_bin('10 seconds'::INTERVAL, ts) as time_window
FROM temp_sensor_data
GROUP BY time_window;`

  const defaultCreateTableSQL = `CREATE TABLE ngx_access_log (
  ip_address STRING,
  http_method STRING,
  request STRING,
  status_code INT16,
  body_bytes_sent INT32,
  user_agent STRING,
  response_size INT32,
  ts TIMESTAMP TIME INDEX,
  PRIMARY KEY (ip_address, http_method, user_agent, status_code)
) WITH ('append_mode'='true')`

  // Form data for structured input - using same prop names as editData
  const formData = reactive({
    // User-editable fields
    flow_name: props.editData?.flow_name || '',
    sink_table_name: props.editData?.sink_table_name || '',
    expire_after: props.editData?.expire_after || '',
    comment: props.editData?.comment || '',
    flow_definition: props.editData?.flow_definition || '',
    ifNotExists: true,

    // Readonly system fields (for edit mode display)
    flow_id: props.editData?.flow_id || '',
    state_size: props.editData?.state_size || '',
    table_catalog: props.editData?.table_catalog || '',
    source_table_ids: props.editData?.source_table_ids || '',
    flownode_ids: props.editData?.flownode_ids || '',
    options: props.editData?.options || '',
    created_time: props.editData?.created_time || '',
    updated_time: props.editData?.updated_time || '',
    last_execution_time: props.editData?.last_execution_time || '',
    source_table_names: props.editData?.source_table_names || '',
  })

  // Text editor data for raw SQL
  const textEditorData = reactive({
    content: props.rawData || '',
  })

  // Computed visibility
  const visible = computed({
    get: () => props.visible,
    set: (value) => emit('update:visible', value),
  })

  // Show create table modal
  const showCreateTableModal = () => {
    createTableModalVisible.value = true
  }

  // Create table from SQL
  const createTable = async () => {
    if (!createTableSQL.value.trim()) {
      return
    }

    try {
      creatingTable.value = true
      await editorAPI.runSQL(createTableSQL.value)
      await getTables()
      // Close modal and reset
      createTableModalVisible.value = false
      createTableSQL.value = ''

      Message.success(t('flow.tableCreated'))
    } finally {
      creatingTable.value = false
    }
  }

  // Format SQL for better readability
  const formatFlowSQL = (sql: string) => {
    if (!sql) return sql

    // Basic SQL formatting for CREATE FLOW statements
    return sql
      .replace(/\s+/g, ' ') // normalize whitespace
      .replace(/CREATE\s+FLOW/i, 'CREATE FLOW')
      .replace(/IF\s+NOT\s+EXISTS/i, 'IF NOT EXISTS')
      .replace(/SINK\s+TO/i, '\nSINK TO')
      .replace(/EXPIRE\s+AFTER/i, '\nEXPIRE AFTER')
      .replace(/COMMENT/i, '\nCOMMENT')
      .replace(/\s+AS\s+/i, '\nAS\n')
      .replace(/SELECT/i, 'SELECT\n  ')
      .replace(/,\s*([a-zA-Z_][a-zA-Z0-9_]*\()/g, ',\n  $1') // format function calls
      .replace(/FROM/i, '\nFROM')
      .replace(/WHERE/i, '\nWHERE')
      .replace(/GROUP\s+BY/i, '\nGROUP BY')
      .replace(/HAVING/i, '\nHAVING')
      .replace(/ORDER\s+BY/i, '\nORDER BY')
      .replace(/LIMIT/i, '\nLIMIT')
      .trim()
  }

  // Fetch flow creation SQL using SHOW CREATE FLOW
  const fetchFlowSQL = async (flowName: string) => {
    if (!flowName) return

    try {
      fetchingFlowSQL.value = true
      const result = await editorAPI.runSQL(`SHOW CREATE FLOW ${flowName}`)

      const { output } = result
      if (output?.[0]?.records?.rows) {
        const { rows } = output[0].records
        if (rows.length > 0) {
          const firstRow = rows[0] as any[]
          if (Array.isArray(firstRow) && firstRow.length > 0) {
            // The SHOW CREATE FLOW typically returns the SQL in the second column, fallback to first
            const createFlowSQL = firstRow[1] || firstRow[0]
            if (createFlowSQL) {
              // Format the SQL for better readability
              textEditorData.content = formatFlowSQL(createFlowSQL)
            }
          }
        }
      }
    } catch (error) {
      console.error('Failed to fetch flow SQL:', error)
      // Fallback content if SHOW CREATE FLOW fails
      textEditorData.content = ``
    } finally {
      fetchingFlowSQL.value = false
    }
  }

  // Initialize textEditorData for edit mode after fetchFlowSQL is defined
  if (props.editData?.flow_name) {
    fetchFlowSQL(props.editData.flow_name)
  }

  // Generate CREATE FLOW SQL from form data
  const generateFlowSQL = () => {
    const parts = [isEdit.value ? 'CREATE OR REPLACE FLOW' : 'CREATE FLOW']

    if (formData.ifNotExists && !isEdit.value) {
      parts.push('IF NOT EXISTS')
    }

    parts.push(formData.flow_name)
    parts.push('SINK TO', formData.sink_table_name)

    if (formData.expire_after) {
      parts.push('EXPIRE AFTER', formData.expire_after)
    }

    if (formData.comment) {
      parts.push(`COMMENT '${formData.comment.replace(/'/g, "''")}'`)
    }

    parts.push('AS')
    parts.push(formData.flow_definition)

    return parts.join('\n')
  }

  // Save flow function
  const saveFlow = async (sql: string, mode: string) => {
    try {
      loading.value = true
      const result = await editorAPI.runSQL(sql)

      // Emit success event
      emit('saved', {
        success: true,
        message: isEdit.value ? t('flow.updatedToast') : t('flow.createdToast'),
        mode,
      })

      // Close modal
      visible.value = false
    } catch (error) {
      console.error('Flow operation failed:', error)

      // Safely extract error message
      const errorMessage = error instanceof Error ? error.message : t('common.unknownError')

      // Emit error event
      emit('saved', {
        success: false,
        message: t('flow.operationFailed', { msg: errorMessage }),
        mode,
      })
    } finally {
      loading.value = false
    }
  }

  // Form submission handler
  const handleSubmit = () => {
    if (!formData.flow_name || !formData.sink_table_name || !formData.flow_definition) {
      // Could add validation message here
      return
    }

    const sql = generateFlowSQL()
    saveFlow(sql, 'form')
  }

  // Text editor submission handler
  const handleTextSubmit = () => {
    if (!textEditorData.content) {
      return
    }

    saveFlow(textEditorData.content, 'text')
  }

  // Clone flow handler - emit both form and raw data
  const handleCloneFlow = () => {
    emit('clone', {
      formData: { ...formData, flow_id: '', flow_name: '' },
      rawData: textEditorData.content,
    })
  }

  // Cancel handler
  const handleCancel = () => {
    visible.value = false
  }

  function renderTs(timestamp: number, dataType: string) {
    const ms = convertTimestampToMilliseconds(timestamp, dataType)
    return formatDateTimeWithMs(ms, 'TimestampMillisecond')
  }

  function renderLastExecution(value: string | number) {
    const ms = new Date(value).getTime()
    return Number.isNaN(ms) ? String(value) : formatDateTime(ms, 'TimestampMillisecond')
  }
</script>

<style lang="less" scoped>
  :deep(.arco-drawer) {
    border: 1px solid var(--gpt-border-default) !important;
  }

  .create-table-content {
    p {
      margin-bottom: var(--gpt-gap-xl);
      line-height: 1.5;
    }
  }
</style>
