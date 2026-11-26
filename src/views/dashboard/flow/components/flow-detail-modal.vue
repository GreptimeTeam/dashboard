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
    //-
      Create mode can switch both ways. Data flows one-way only: entering Raw seeds the
      editor from the form (only while Raw is empty), but returning to Form never imports
      the raw text (that would need browser-side SQL parsing). Edit has no mode switch.
    .gpt-drawer-mode-bar(v-if="!isEdit")
      .flow-mode-switch
        a-radio-group(
          type="button"
          size="small"
          :model-value="editorMode"
          @update:model-value="onEditorModeUpdate"
        )
          a-radio(value="form") {{ $t('flow.formMode') }}
          a-radio(value="text") {{ $t('flow.rawMode') }}

    // Form mode
    template(v-if="editorMode === 'form'")
      a-form(layout="vertical" :model="formData")
        a-row(v-if="!isEdit" :gutter="16")
          a-col(:span="24")
            a-form-item(field="flow_name" required :label="$t('flow.name')")
              a-input(v-model="formData.flow_name" :placeholder="$t('flow.namePlaceholder')")

        a-form-item(field="sink_table_name" :label="$t('flow.sinkTable')")
          .sink-table-field
            TableSelect.sink-table-select(
              ref="tableSelectRef"
              v-model="formData.sink_table_name"
              allow-create
              :database="database"
              :placeholder="$t('flow.sinkTablePlaceholder')"
              @update:model-value="onSinkTableChange"
            )
            a-button.sink-table-precreate(type="text" :loading="creatingTable" @click="showCreateTableModal")
              | {{ $t('flow.createSinkTable') }}

        a-row(:gutter="16")
          a-col(:span="12")
            a-form-item(field="expire_after" :label="$t('flow.expireAfter')")
              a-input(v-model="formData.expire_after" :placeholder="$t('flow.expireAfterPlaceholder')")
          a-col(:span="12")
            a-form-item(field="eval_interval" :label="$t('flow.evalInterval')")
              a-input(v-model="formData.eval_interval" :placeholder="$t('flow.evalIntervalPlaceholder')")

        a-row(:gutter="16")
          a-col(:span="12")
            a-form-item(field="eval_offset" :label="$t('flow.evalOffset')")
              a-input(v-model="formData.eval_offset" :placeholder="$t('flow.evalOffsetPlaceholder')")
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
          template(#extra)
            | {{ $t('flow.definitionHint') }}

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
  import { ref, reactive, computed, watch } from 'vue'
  import { Message } from '@arco-design/web-vue'
  import { storeToRefs } from 'pinia'
  import { useI18n } from 'vue-i18n'
  import LangEditor from '@/components/lang-editor.vue'
  import editorAPI from '@/api/editor'
  import { useAppStore } from '@/store'
  import TableSelect from '@/components/table-select/index.vue'
  import type { ColumnType } from '@/types/query'
  import { convertTimestampToMilliseconds } from '@/utils/date-time'
  import { useDateTimeFormat } from '@/hooks'
  import {
    defaultSinkName,
    looksLikeCompleteFlowDdl,
    looksLikeFlowDdl,
    quoteFlowIdent,
    toReplaceFlowSql,
  } from '../utils/flow-sql'
  import apiErrorMessage from '../utils/api-error'

  const { t } = useI18n()
  const { formatDateTime, formatDateTimeWithMs } = useDateTimeFormat()

  interface Props {
    visible: boolean
    editData?: any
    schemaColumns?: ColumnType[]
  }

  interface Emits {
    (e: 'update:visible', value: boolean): void
    (e: 'saved', data: { success: boolean; message?: string; mode: string }): void
  }

  const props = withDefaults(defineProps<Props>(), {
    visible: false,
    editData: null,
  })

  const emit = defineEmits<Emits>()

  // Edit mode: calculated from editData initially
  const isEdit = ref(!!props.editData?.flow_id)

  // Editor mode: Raw for edit; Form for fresh create (Form → Raw is one-way).
  // Do not watch() this ref for Form/Raw sync — a sync watcher runs inside the same
  // flush as a-radio-group's v-model write and remounts LangEditor, which surfaces as:
  // TypeError: 'set' on proxy: trap returned falsish for property 'editorMode'
  const editorMode = ref(isEdit.value ? 'text' : 'form')
  const loading = ref(false)
  const fetchingFlowSQL = ref(false)

  // Get current database from app store
  const { tableCatalog, tableSchema, database } = storeToRefs(useAppStore())

  const tableSelectRef = ref<{ reload: () => Promise<void> }>()
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
EVAL INTERVAL '1m'
EVAL OFFSET '30s'
COMMENT 'My flow description'
AS
SELECT
  max(temperature) as max_temp,
  date_bin('10 seconds'::INTERVAL, ts) as time_window
FROM temp_sensor_data
GROUP BY time_window;`

  // Form data for structured input - using same prop names as editData
  // flow_definition is never prefilled from editData (column is full DDL after GreptimeDB #7704)
  const formData = reactive({
    // User-editable fields
    flow_name: props.editData?.flow_name || '',
    sink_table_name: props.editData?.sink_table_name || '',
    expire_after: props.editData?.expire_after || '',
    eval_interval: '',
    eval_offset: '',
    comment: props.editData?.comment || '',
    flow_definition: '',
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

  // Sink skeleton matching the Flow contract: columns in query order, a TIME INDEX, an
  // optional trailing update_at (batching SQL sinks add one automatically), and PRIMARY KEY
  // tags. Never append_mode — a sink has to be updatable by (tags, time index).
  const defaultCreateTableSQL = computed(() => {
    const table = formData.sink_table_name?.trim() || `${formData.flow_name.trim() || 'my_flow'}_sink`
    return `CREATE TABLE ${table} (
  service STRING,
  total_count INT64,
  time_window TIMESTAMP TIME INDEX,
  update_at TIMESTAMP,
  PRIMARY KEY (service)
)`
  })

  // Text editor data for raw SQL
  const textEditorData = reactive({
    content: '',
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
      await tableSelectRef.value?.reload()
      // Close modal and reset
      createTableModalVisible.value = false
      createTableSQL.value = ''

      Message.success(t('flow.tableCreated'))
    } finally {
      creatingTable.value = false
    }
  }

  // Fetch flow creation SQL using SHOW CREATE FLOW. The server output is already canonical
  // (one clause per line), so it is shown as-is — no client-side re-formatting.
  const fetchFlowSQL = async (flowName: string) => {
    if (!flowName) return

    try {
      fetchingFlowSQL.value = true
      const result = await editorAPI.runSQL(`SHOW CREATE FLOW ${quoteFlowIdent(flowName)}`)

      const { output } = result
      if (output?.[0]?.records?.rows) {
        const { rows } = output[0].records
        if (rows.length > 0) {
          const firstRow = rows[0] as any[]
          if (Array.isArray(firstRow) && firstRow.length > 0) {
            // The SHOW CREATE FLOW typically returns the SQL in the second column, fallback to first
            const createFlowSQL = firstRow[1] || firstRow[0]
            if (createFlowSQL) {
              textEditorData.content = isEdit.value ? toReplaceFlowSql(createFlowSQL) : createFlowSQL
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

  // Last-resort fallback when the field is empty (submit already requires a flow name).
  const resolveSinkTableName = () => formData.sink_table_name?.trim() || defaultSinkName(formData.flow_name)

  // `SINK TO` is mandatory (the server has no default sink name), so prefill the field as
  // soon as the flow name is typed. Once the user edits the sink themselves, stop syncing.
  const sinkAutoFilled = ref(!props.editData?.sink_table_name)
  const sinkPrefillEnabled = computed(() => !isEdit.value)

  watch(
    () => formData.flow_name,
    (name) => {
      if (!sinkPrefillEnabled.value || !sinkAutoFilled.value) return
      formData.sink_table_name = defaultSinkName(name)
    }
  )

  const onSinkTableChange = () => {
    sinkAutoFilled.value = false
  }

  // Generate CREATE FLOW SQL from form data
  const generateFlowSQL = () => {
    const parts = [isEdit.value ? 'CREATE OR REPLACE FLOW' : 'CREATE FLOW']

    if (formData.ifNotExists && !isEdit.value) {
      parts.push('IF NOT EXISTS')
    }

    parts.push(formData.flow_name.trim())
    parts.push('SINK TO', resolveSinkTableName())

    if (formData.expire_after) {
      parts.push('EXPIRE AFTER', formData.expire_after)
    }

    if (formData.eval_interval) {
      parts.push('EVAL INTERVAL', formData.eval_interval)
    }

    if (formData.eval_offset) {
      parts.push('EVAL OFFSET', formData.eval_offset)
    }

    if (formData.comment) {
      parts.push(`COMMENT '${formData.comment.replace(/'/g, "''")}'`)
    }

    parts.push('AS')
    parts.push(formData.flow_definition.trim())

    return parts.join('\n')
  }

  // Form → Raw only, and only once: seed the raw editor from the form when it is still
  // empty. Juggling form fields never overwrites text already written in Raw, and the raw
  // text is never imported back into the form.
  const switchToRaw = () => {
    if (textEditorData.content.trim()) return
    const definition = formData.flow_definition.trim()
    if (looksLikeFlowDdl(definition)) {
      textEditorData.content = definition
    } else if (formData.flow_name.trim() && definition) {
      textEditorData.content = generateFlowSQL()
    }
  }

  // Explicit move (a full DDL was pasted into the form): always copy it to Raw.
  const moveDefinitionToRaw = () => {
    textEditorData.content = formData.flow_definition.trim()
    formData.flow_definition = ''
    editorMode.value = 'text'
    Message.info(t('flow.ddlMovedToRaw'))
  }

  const onEditorModeUpdate = (mode: string | number | boolean) => {
    const next = mode === 'text' ? 'text' : 'form'
    if (next === editorMode.value) return
    if (next === 'text') switchToRaw()
    // Returning to Form keeps both sides untouched — no reverse sync.
    editorMode.value = next
  }

  // Detect a full CREATE FLOW statement as soon as it is pasted (or typed) into the form's
  // SQL box and move it to the Raw editor right away, instead of stripping it on submit.
  // Requires SINK TO so a half-typed `CREATE FLOW` does not hijack the editor mid-word.
  watch(
    () => formData.flow_definition,
    (value) => {
      if (isEdit.value || editorMode.value !== 'form') return
      if (looksLikeCompleteFlowDdl(value)) moveDefinitionToRaw()
    }
  )

  // Save flow function. The drawer reports failures itself, so the interceptor toast is
  // suppressed to avoid showing the same server error twice.
  const saveFlow = async (sql: string, mode: string) => {
    try {
      loading.value = true
      await editorAPI.runSQL(sql, undefined, { suppressErrorToast: true })

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

      // Emit error event
      emit('saved', {
        success: false,
        message: t('flow.operationFailed', { msg: apiErrorMessage(error, t('common.unknownError')) }),
        mode,
      })
    } finally {
      loading.value = false
    }
  }

  // Form submission handler
  const handleSubmit = () => {
    if (!formData.flow_name?.trim()) {
      Message.warning(t('flow.nameRequired'))
      return
    }
    if (!formData.flow_definition?.trim()) {
      Message.warning(t('flow.definitionRequired'))
      return
    }

    // A full DDL belongs to Raw mode; move it there instead of trying to strip it here.
    if (looksLikeFlowDdl(formData.flow_definition)) {
      moveDefinitionToRaw()
      return
    }

    saveFlow(generateFlowSQL(), 'form')
  }

  // Text editor submission handler
  const handleTextSubmit = () => {
    if (!textEditorData.content?.trim()) {
      Message.warning(t('flow.statementRequired'))
      return
    }

    saveFlow(textEditorData.content, 'text')
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

  .sink-table-field {
    display: flex;
    align-items: center;
    gap: var(--gpt-gap-sm);
    width: 100%;
  }

  .sink-table-select {
    flex: 1;
    min-width: 0;
    width: 100%;
  }

  .sink-table-precreate {
    flex-shrink: 0;
  }

  .flow-mode-switch {
    display: flex;
    align-items: center;
    gap: var(--gpt-gap-sm);
  }

  .create-table-content {
    p {
      margin-bottom: var(--gpt-gap-xl);
      line-height: 1.5;
    }
  }
</style>
