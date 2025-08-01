<template lang="pug">
a-drawer(
  v-model:visible="visible"
  :title="isEdit ? 'Edit Flow' : 'Create Flow'"
  :width="900"
  :mask="false"
  :hide-cancel="true"
  @cancel="handleCancel"
)
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
          | {{ formData.flowId || '-' }}
        a-descriptions-item(label="State Size")
          | {{ formData.stateSize || '-' }}
        a-descriptions-item(label="Source Table Names" :span="2")
          | {{ formData.sourceTableNames || '-' }}
        a-descriptions-item(label="Source Table IDs" :span="2")
          | {{ formData.sourceTableIds || '-' }}
        a-descriptions-item(label="Created Time")
          | {{ formData.createdTime || '-' }}
        a-descriptions-item(label="Updated Time")
          | {{ formData.updatedTime || '-' }}
        a-descriptions-item(label="Last Execution")
          | {{ formData.lastExecutionTime || '-' }}
    a-radio-group(
      v-model="editorMode"
      type="button"
      size="small"
      style="margin-bottom: 16px"
    )
      a-radio(value="form") Form
      a-radio(value="text") Raw

    // Form mode
    template(v-if="editorMode === 'form'")
      a-form(layout="vertical" :model="formData")
        // User-editable fields
        .editable-fields-section
          a-row(:gutter="16")
            a-col(:span="12")
              a-form-item(field="flowName" label="Flow Name" required)
                a-input(v-model="formData.flowName" placeholder="Enter flow name")
            a-col(:span="12")
              a-form-item(field="sinkTable" label="Sink Table" required)
                a-select(
                  v-model="formData.sinkTable"
                  style="width: 100%"
                  placeholder="Select sink table"
                  :allow-search="true"
                  :allow-create="true"
                  :loading="tablesLoading"
                  :trigger-props="{ autoFitPopupMinWidth: true }"
                  :options="availableTables.map((table) => ({ label: table, value: table }))"
                )

          a-row(:gutter="16")
            a-col(:span="12")
              a-form-item(field="expireAfter" label="Expire After (Optional)")
                a-input(v-model="formData.expireAfter" placeholder="e.g., '1 hour'::INTERVAL")
            a-col(:span="12")
              a-form-item(v-if="!isEdit" field="ifNotExists" label="Options")
                a-checkbox(v-model="formData.ifNotExists") IF NOT EXISTS

          a-form-item(field="comment" label="Comment (Optional)")
            a-textarea(v-model="formData.comment" placeholder="Enter flow description" :rows="2")

          a-form-item(field="flowDefinition" label="Flow Definition" required)
            YmlEditor(
              v-model="formData.flowDefinition"
              language="sql"
              placeholder="SELECT max(temperature) as max_temp, date_bin('10 seconds'::INTERVAL, ts) as time_window FROM temp_sensor_data GROUP BY time_window"
              style="width: 100%; height: 200px; border: 1px solid var(--color-border); border-radius: 4px; overflow: hidden"
            )

    // Text editor mode  
    template(v-else)
      .editable-fields-section
        a-form(layout="vertical" :model="textEditorData")
          a-form-item(field="content" label="Flow Statement")
            a-spin(style="width: 100%" :loading="fetchingFlowSQL")
              YmlEditor(
                v-model="textEditorData.content"
                language="sql"
                placeholder="CREATE FLOW IF NOT EXISTS my_flow&#10;SINK TO my_sink_table&#10;EXPIRE AFTER '1 hour'::INTERVAL&#10;COMMENT 'My flow description'&#10;AS&#10;SELECT max(temperature) as max_temp,&#10;       date_bin('10 seconds'::INTERVAL, ts) as time_window&#10;FROM temp_sensor_data&#10;GROUP BY time_window;"
                style="width: 100%; height: 500px; border: 1px solid var(--color-border); border-radius: 4px; overflow: hidden"
              )

  template(#footer)
    .drawer-footer
      a-space
        a-button(@click="handleCancel") Cancel
        a-button(
          type="primary"
          :loading="loading"
          @click="editorMode === 'form' ? handleSubmit() : handleTextSubmit()"
        ) 
          | {{ isEdit ? 'Update' : 'Create' }} Flow
</template>

<script setup lang="ts">
  import { ref, reactive, watch, computed } from 'vue'
  import { storeToRefs } from 'pinia'
  import YmlEditor from '@/components/yml-editor.vue'
  import editorAPI from '@/api/editor'
  import { useAppStore } from '@/store'

  interface Props {
    visible: boolean
    isEdit?: boolean
    editData?: any
  }

  interface Emits {
    (e: 'update:visible', value: boolean): void
    (e: 'saved', data: { success: boolean; message?: string; mode: string }): void
  }

  const props = withDefaults(defineProps<Props>(), {
    visible: false,
    isEdit: false,
    editData: null,
  })

  const emit = defineEmits<Emits>()

  // Editor mode: 'form' or 'text'
  const editorMode = ref('form')
  const loading = ref(false)
  const fetchingFlowSQL = ref(false)

  // Get current database from app store
  const { database } = storeToRefs(useAppStore())

  // Available tables for sink table selection
  const availableTables = ref<string[]>([])
  const tablesLoading = ref(false)

  // Form data for structured input
  const formData = reactive({
    // User-editable fields
    flowName: '',
    sinkTable: '',
    expireAfter: '',
    comment: '',
    flowDefinition: '',
    ifNotExists: true,

    // Readonly system fields (for edit mode display)
    flowId: '',
    stateSize: '',
    tableCatalog: '',
    sourceTableIds: '',
    flownodeIds: '',
    options: '',
    createdTime: '',
    updatedTime: '',
    lastExecutionTime: '',
    sourceTableNames: '',
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

  // Fetch available tables for sink table selection
  const fetchAvailableTables = async () => {
    try {
      tablesLoading.value = true
      const sql = `SELECT DISTINCT table_name FROM information_schema.columns WHERE table_schema = '${database.value}' ORDER BY table_name`
      const result = await editorAPI.runSQL(sql)
      availableTables.value = result.output[0].records.rows.map((row: string[]) => row[0])
    } catch (error) {
      console.error('Failed to fetch tables:', error)
      availableTables.value = []
    } finally {
      tablesLoading.value = false
    }
  }

  // Reset form data
  const resetForm = () => {
    // Reset user-editable fields
    formData.flowName = ''
    formData.sinkTable = ''
    formData.expireAfter = ''
    formData.comment = ''
    formData.flowDefinition = ''
    formData.ifNotExists = true

    // Reset readonly fields
    formData.flowId = ''
    formData.stateSize = ''
    formData.tableCatalog = ''
    formData.sourceTableIds = ''
    formData.flownodeIds = ''
    formData.options = ''
    formData.createdTime = ''
    formData.updatedTime = ''
    formData.lastExecutionTime = ''
    formData.sourceTableNames = ''

    textEditorData.content = ''
    editorMode.value = 'form'
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
            console.log(createFlowSQL, 'createFlowSQL')
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
      textEditorData.content = `-- Failed to fetch flow definition for: ${flowName}
-- Please write the flow definition manually
CREATE OR REPLACE  FLOW ${flowName}
SINK TO your_sink_table
AS
SELECT
  -- Add your aggregation functions here
  max(column_name) as max_value,
  date_bin('10 seconds'::INTERVAL, ts) as time_window
FROM source_table
GROUP BY time_window`
    } finally {
      fetchingFlowSQL.value = false
    }
  }

  // Generate CREATE FLOW SQL from form data
  const generateFlowSQL = () => {
    const parts = ['CREATE OR REPLACE FLOW']

    if (formData.ifNotExists && !props.isEdit) {
      parts.push('IF NOT EXISTS')
    }

    parts.push(formData.flowName)
    parts.push('SINK TO', formData.sinkTable)

    // if (formData.expireAfter) {
    //   parts.push('EXPIRE AFTER', formData.expireAfter)
    // }

    if (formData.comment) {
      parts.push(`COMMENT '${formData.comment.replace(/'/g, "''")}'`)
    }

    parts.push('AS')
    parts.push(formData.flowDefinition)

    return parts.join('\n')
  }

  // Save flow function
  const saveFlow = async (sql: string, mode: string) => {
    try {
      loading.value = true
      const result = await editorAPI.runSQL(sql)
      console.log('Flow operation result:', result)

      // Emit success event
      emit('saved', {
        success: true,
        message: props.isEdit ? 'Flow updated successfully' : 'Flow created successfully',
        mode,
      })

      // Close modal and reset form
      visible.value = false
      resetForm()
    } catch (error) {
      console.error('Flow operation failed:', error)

      // Safely extract error message
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'

      // Emit error event
      emit('saved', {
        success: false,
        message: `Flow operation failed: ${errorMessage}`,
        mode,
      })
    } finally {
      loading.value = false
    }
  }

  // Form submission handler
  const handleSubmit = () => {
    if (!formData.flowName || !formData.sinkTable || !formData.flowDefinition) {
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

  // Cancel handler
  const handleCancel = () => {
    visible.value = false
    resetForm()
  }

  // Watch for edit data changes
  watch(
    () => props.editData,
    async (newData) => {
      if (newData && props.isEdit) {
        // Populate user-editable fields
        formData.flowName = newData.flow_name || ''
        formData.sinkTable = newData.sink_table_name || ''
        formData.comment = newData.comment || ''
        formData.flowDefinition = newData.flow_definition || ''
        formData.expireAfter = newData.expire_after ? String(newData.expire_after) : ''

        // Populate readonly system fields
        formData.flowId = newData.flow_id ? String(newData.flow_id) : ''
        formData.stateSize = newData.state_size ? String(newData.state_size) : ''
        formData.tableCatalog = newData.table_catalog || ''
        formData.sourceTableIds = newData.source_table_ids || ''
        formData.flownodeIds = newData.flownode_ids || ''
        formData.options = newData.options || ''
        formData.sourceTableNames = newData.source_table_names || ''

        // Format timestamps for display
        formData.createdTime = newData.created_time ? new Date(newData.created_time).toLocaleString() : ''
        formData.updatedTime = newData.updated_time ? new Date(newData.updated_time).toLocaleString() : ''
        formData.lastExecutionTime = newData.last_execution_time
          ? new Date(newData.last_execution_time).toLocaleString()
          : ''

        // Fetch the actual flow creation SQL for text editor mode
        if (newData.flow_name) {
          await fetchFlowSQL(newData.flow_name)
        }
      }
    },
    { immediate: true }
  )

  // Watch for modal visibility changes
  watch(
    () => props.visible,
    (isVisible) => {
      if (!isVisible) {
        resetForm()
      } else {
        // Fetch tables when modal opens
        fetchAvailableTables()
      }
    }
  )

  // Watch for database changes
  watch(
    () => database.value,
    () => {
      fetchAvailableTables()
    },
    { immediate: true }
  )

  // Expose loading state for parent component
  defineExpose({
    setLoading: (state: boolean) => {
      loading.value = state
    },
  })
</script>

<style scoped lang="less">
  .flow-detail-container {
    .readonly-fields-section {
      margin-bottom: 24px;
      padding: 16px;
      background-color: var(--color-fill-1);
      border-radius: 6px;
      border: 1px solid var(--color-border-2);

      h4 {
        margin: 0 0 16px 0;
        color: var(--color-text-2);
        font-size: 14px;
        font-weight: 600;
      }
    }

    .mode-selector {
      margin-bottom: 20px;
      padding-bottom: 16px;
      border-bottom: 1px solid var(--color-border);
    }

    .editable-fields-section {
      h4 {
        margin: 0 0 16px 0;
        color: var(--color-text-1);
        font-size: 14px;
        font-weight: 600;
      }
    }
  }

  .drawer-footer {
    display: flex;
    justify-content: flex-end;
    padding: 16px 0;
  }

  :deep(.arco-form-item-label) {
    font-weight: 500;
  }

  :deep(.arco-input),
  :deep(.arco-textarea) {
    border-radius: 4px;
  }

  // Readonly field styling
  :deep(.arco-input[readonly]),
  :deep(.arco-textarea[readonly]) {
    background-color: var(--color-fill-2);
    color: var(--color-text-3);
    cursor: default;

    &:hover {
      border-color: var(--color-border);
    }
  }

  :deep(.arco-radio-group) {
    .arco-radio-button {
      border-radius: 4px;
    }

    .arco-radio-button:first-child {
      border-top-right-radius: 0;
      border-bottom-right-radius: 0;
    }

    .arco-radio-button:last-child {
      border-top-left-radius: 0;
      border-bottom-left-radius: 0;
    }
  }
</style>
