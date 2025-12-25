<template lang="pug">
a-form(
  layout="inline"
  label-align="left"
  size="small"
  auto-label-width
  :model="form"
)
  a-form-item(:label="t('sqlBuilder.table')")
    a-select(
      v-model="form.table"
      style="min-width: 120px; width: auto"
      :placeholder="t('sqlBuilder.selectTable')"
      :allow-search="true"
      :trigger-props="{ autoFitPopupMinWidth: true }"
      :options="tables"
      @change="handleTableChange"
    )
  a-form-item(style="margin-right: 12px" :label="t('sqlBuilder.filters')")
    .condition-wrapper
      a-space(v-for="(condition, index) in form.conditions" :key="index")
        a-input-group.input-group
          a-select(
            v-if="index > 0"
            v-model="condition.relation"
            style="width: auto"
            :options="relationOptions"
          )
          a-select.field(
            v-model="condition.field"
            allow-search
            style="width: 140px"
            :placeholder="t('sqlBuilder.field')"
            :trigger-props="{ autoFitPopupMinWidth: true }"
            :options="fieldsOptions"
            @change="() => handleFieldChange(condition)"
          )
          a-select.operator(
            v-model="condition.operator"
            style="width: auto"
            :placeholder="t('sqlBuilder.operator')"
            :trigger-props="{ autoFitPopupMinWidth: true }"
            :options="getOperators(condition.field)"
          )
          template(v-if="condition.operator !== 'Not Exist' && condition.operator !== 'Exist'")
            a-select.value(
              v-if="getFieldType(condition.field) === 'Boolean'"
              v-model.boolean="condition.value"
              style="width: 60px"
              :placeholder="t('sqlBuilder.value')"
              :options="['true', 'false']"
            )
            a-input.value(
              v-else
              v-model="condition.value"
              style="width: 60px"
              :placeholder="condition.operator === 'IN' || condition.operator === 'NOT IN' ? t('sqlBuilder.commaValuesHint') : t('sqlBuilder.value')"
            )
          a-button.field-action(@click="() => removeCondition(index)")
            icon-minus(style="cursor: pointer; font-size: 14px")

      a-button.field-action(@click="addCondition")
        icon-plus(style="cursor: pointer; font-size: 14px")

  // More options trigger
  a-form-item
    a-trigger(trigger="click" :unmount-on-close="false")
      a-button.more-toggle(type="text")
        | {{ t('sqlBuilder.more') }}
        icon-down(style="font-size: 10px; margin-left: 4px")

      template(#content)
        .more-popup
          .more-popup-header
            h4 {{ t('sqlBuilder.moreOptions') }}
          .more-popup-content
            a-form-item(:label="t('sqlBuilder.orderBy')")
              a-space(size="small")
                a-input-group.input-group
                  a-select(
                    v-model="form.orderByField"
                    style="width: auto"
                    allow-search
                    :placeholder="t('sqlBuilder.selectField')"
                    :trigger-props="{ autoFitPopupMinWidth: true }"
                    :options="fieldsOptions"
                  )
                  a-select(
                    v-model="form.orderBy"
                    style="width: 80px"
                    :placeholder="t('sqlBuilder.order')"
                    :options="orderOptions"
                  )
            a-form-item(:label="t('sqlBuilder.limit')")
              a-input-number(
                v-model="form.limit"
                style="width: 80px"
                :placeholder="t('sqlBuilder.limit')"
                :step="100"
                :min="1"
                :max="10000"
              )

// Quick Filters component
QuickFilters(
  :fields="fields"
  :form="form"
  :quick-field-names="props.quickFieldNames"
  :storage-key="storageKey"
  @apply="applyQuickFilter"
)
</template>

<script setup name="SQLBuilder" lang="ts">
  import { ref, watch, onMounted, computed, readonly, reactive } from 'vue'
  import { useI18n } from 'vue-i18n'
  import { useLocalStorage } from '@vueuse/core'
  import { storeToRefs } from 'pinia'
  import editorAPI from '@/api/editor'
  import { useAppStore } from '@/store'
  import QuickFilters from '@/components/quick-filters/index.vue'
  import type { Condition, BuilderFormState as Form } from '@/types/query'
  import { TsTypeMapping } from '@/utils/date-time'

  const { t } = useI18n()

  interface TableField {
    name: string
    data_type: string
    semantic_type: string
  }

  interface QuickFilter {
    name: string
    table: string
    conditions: Condition[]
    orderByField: string
    orderBy: string
    limit: number
    createdAt: number
  }

  const emit = defineEmits(['update:sql', 'update:formState'])

  // Props for form state and configuration
  const props = defineProps<{
    formState: Form | null
    tableFilter?: string // Optional filter for which tables to show (e.g., 'trace_id' for traces)
    storageKey?: string // Optional storage key for localStorage (e.g., 'logs-query-table', 'traces-query-table')
    quickFieldNames?: string[] // Array of field names for quick condition buttons
    defaultFormState?: Form
  }>()

  const tables = ref<string[]>([])
  const tableMap = ref<{ [key: string]: TableField[] }>({})

  // Get current database from app store
  const { database, tableCatalog, tableSchema } = storeToRefs(useAppStore())

  // Use localStorage to remember the last selected table
  const storageKey = props.storageKey || 'sql-builder-last-table'
  const lastSelectedTable = useLocalStorage(storageKey, '')

  // Initialize form state as reactive object
  const form = reactive<Form>(props.formState)
  // Watch form changes and emit updates for v-model
  // just to declare support for model, indeed this watch is not needed
  // watch(
  //   form,
  //   (newForm) => {
  //     emit('update:formState', newForm)
  //   },
  //   { deep: true }
  // )

  const fields = computed(() => {
    if (!form.table || !tableMap.value[form.table]) return []
    return tableMap.value[form.table].filter((field) => field.data_type.toLowerCase() !== 'json')
  })

  const fieldsOptions = computed(() => {
    return fields.value.map((column) => ({
      label: column.name,
      value: column.name,
    }))
  })

  const timeColumns = computed(() => {
    const tsColumns = fields.value.filter((column) => column.data_type.toLowerCase().indexOf('timestamp') > -1)
    const tsIndexColumns = tsColumns.filter((column) => column.semantic_type === 'TIMESTAMP')
    return tsIndexColumns.map((column) => ({
      label: column.name,
      value: column.name,
    }))
  })

  /** Computed timestamp column from available columns - included in form state */
  const tsColumn = computed(() => {
    if (!fields.value.length) return null

    // Find timestamp columns by data type
    const tsColumns = fields.value.filter((col) => col.data_type.toLowerCase().includes('timestamp'))

    // Prefer columns with TIMESTAMP semantic type
    const tsIndexColumns = tsColumns.filter((col) => col.semantic_type === 'TIMESTAMP')
    const selectedColumn = tsIndexColumns.length ? tsIndexColumns[0] : tsColumns[0]

    if (!selectedColumn) return null

    // Return the column with data_type - DataTable will calculate the multiple automatically
    return {
      name: selectedColumn.name,
      data_type: TsTypeMapping[selectedColumn.data_type] || selectedColumn.data_type,
    }
  })

  // Watch tsColumn changes and update form state
  watch(
    tsColumn,
    (newTsColumn) => {
      form.tsColumn = newTsColumn
    },
    { immediate: true }
  )

  const orderOptions = computed(() => [
    { label: t('sqlBuilder.asc'), value: 'ASC' },
    { label: t('sqlBuilder.desc'), value: 'DESC' },
  ])

  const relationOptions = computed(() => [
    { label: t('sqlBuilder.and'), value: 'AND' },
    { label: t('sqlBuilder.or'), value: 'OR' },
  ])

  // Operator mapping based on field data type (similar to log query)
  const operatorMap = {
    String: ['=', '!=', 'LIKE', 'NOT LIKE', 'Not Exist', 'Exist', 'IN', 'NOT IN'],
    Number: ['=', '!=', '>', '>=', '<', '<=', 'Not Exist', 'Exist', 'IN', 'NOT IN'],
    Time: ['>', '>=', '<', '<=', 'Not Exist', 'Exist', 'IN', 'NOT IN'],
    Boolean: ['=', '!=', 'Not Exist', 'Exist'],
    Default: ['=', '!=', '>', '<', '>=', '<=', 'LIKE', 'NOT LIKE', 'Not Exist', 'Exist', 'IN', 'NOT IN'],
  }

  function getFieldType(fieldName: string): string {
    const field = fields.value.find((f) => f.name === fieldName)
    if (!field) return 'String'

    const dataType = field.data_type.toLowerCase()

    if (dataType.includes('timestamp') || dataType.includes('date')) {
      return 'Time'
    }
    if (
      dataType.includes('int') ||
      dataType.includes('float') ||
      dataType.includes('double') ||
      dataType.includes('decimal')
    ) {
      return 'Number'
    }
    if (dataType.includes('bool')) {
      return 'Boolean'
    }

    return 'String'
  }

  function getOperators(field: string) {
    const fieldType = getFieldType(field)
    const operators = operatorMap[fieldType] || operatorMap.Default

    return operators.map((op) => ({
      label: op,
      value: op,
    }))
  }

  async function fetchTables() {
    try {
      let sql = `SELECT DISTINCT table_name FROM information_schema.columns WHERE table_catalog = '${tableCatalog.value}' AND table_schema = '${tableSchema.value}'`

      // Add filter if specified (e.g., for traces we want tables with trace_id column)
      if (props.tableFilter) {
        sql += ` AND column_name = '${props.tableFilter}'`
      }

      sql += ` ORDER BY table_name`

      const result = await editorAPI.runSQL(sql)
      tables.value = result.output[0].records.rows.map((row: string[]) => row[0])

      // Validate and set table from localStorage or default
      if (lastSelectedTable.value && tables.value.includes(lastSelectedTable.value)) {
        // Use the remembered table if it still exists
        form.table = lastSelectedTable.value
      } else if (tables.value.length > 0) {
        // Use first available table if remembered table doesn't exist
        form.table = tables.value[0]
      }
    } catch (error) {
      console.error('Failed to fetch tables:', error)
    }
  }

  async function fetchTableFields(tableName: string) {
    if (!tableName) return
    try {
      const result = await editorAPI.getTableSchema(tableName)
      tableMap.value[tableName] = result
    } catch (error) {
      console.error('Failed to fetch table fields:', error)
    }
  }

  function handleTableChange() {
    // Save the selected table to localStorage
    lastSelectedTable.value = form.table

    // Reset form state for new table with deep clone
    Object.assign(form, JSON.parse(JSON.stringify(props.defaultFormState || {})), { table: form.table })
  }

  // Watch for timeColumns changes - no longer add default time range condition
  watch(timeColumns, (newTimeColumns) => {
    if (form.table && newTimeColumns.length > 0) {
      const firstTimeColumn = newTimeColumns[0]
      if (!form.orderByField) {
        form.orderByField = firstTimeColumn.value
      }
    }
  })

  function addCondition() {
    form.conditions.push({
      field: '',
      operator: '=',
      value: '',
      relation: 'AND',
      isTimeColumn: false,
      fieldType: 'String',
    })
  }

  function handleFieldChange(condition: Condition) {
    condition.fieldType = getFieldType(condition.field)
  }

  function removeCondition(index: number) {
    form.conditions.splice(index, 1)
  }

  // Load saved state on mount

  watch(
    () => database.value,
    () => {
      fetchTables()
    },
    {
      immediate: true,
    }
  )

  watch(
    () => form.table,
    (newTable) => {
      if (newTable) {
        // Save to localStorage whenever table changes
        lastSelectedTable.value = newTable
      }
      fetchTableFields(form.table)
      // Table value is now extracted from form state in parent component
    },
    { immediate: true }
  )

  // Function to add a filter condition from external components
  function addFilterCondition(columnName: string, operator: string, value: string) {
    const column = fields.value.find((col) => col.name === columnName)
    if (!column) return

    const isTimeCol = column.data_type.toLowerCase().includes('timestamp')

    const newCondition: Condition = {
      field: columnName,
      operator,
      value: String(value),
      isTimeColumn: isTimeCol,
      relation: 'AND',
      fieldType: getFieldType(columnName),
    }

    form.conditions.push(newCondition)
    // SQL will automatically regenerate due to computed property
  }

  // Function to apply a saved quick filter
  function applyQuickFilter(quickFilter: QuickFilter) {
    // Switch to the saved table if different
    if (quickFilter.table !== form.table) {
      form.table = quickFilter.table
    }

    // Apply the saved conditions and settings
    form.conditions = [...quickFilter.conditions]
    form.orderByField = quickFilter.orderByField
    form.orderBy = quickFilter.orderBy as 'DESC' | 'ASC'
    form.limit = quickFilter.limit
  }

  // Expose methods for external use
  defineExpose({
    addFilterCondition,
  })
</script>

<style lang="less" scoped>
  :deep(.operator .arco-select-view-value) {
    justify-content: center !important;
  }
  :deep(.arco-form-item-label-col) {
    padding-right: 8px;
  }
  :deep(.arco-form-layout-inline .arco-form-item) {
    margin-bottom: 0;
  }
  .condition-wrapper {
    display: flex;
    gap: 12px;
    align-items: center;
    flex-wrap: wrap;
  }

  .input-group {
    display: flex;
  }

  .field {
    width: 150px;
  }

  .arco-select.operator {
    width: auto;
  }

  .value {
    width: 100px;
  }

  :deep(.arco-input-append) {
    padding: 0 4px;
  }

  :deep(.arco-select-view-input) {
    width: 100px;
  }
  :deep(.arco-btn-secondary[type='button']) {
    color: var(--color-text-2);
    background-color: var(--color-secondary);
  }
  :deep(.arco-btn-text[type='button']) {
    color: var(--color-text-2);
  }

  .more-toggle {
    color: var(--color-text-2);
    font-size: 14px;
    line-height: 2;
  }

  .more-count {
    color: var(--color-text-3);
  }

  .more-popup {
    background: var(--color-bg-1);
    border: 1px solid var(--color-border);
    border-radius: 8px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    min-width: 280px;
  }

  .more-popup-header {
    padding: 12px 16px;
    border-bottom: 1px solid var(--color-border);
  }

  .more-popup-header h4 {
    margin: 0;
    font-size: 14px;
    font-weight: 500;
    color: var(--color-text-1);
  }

  .more-popup-content {
    padding: 16px;
  }

  // Fix input group corners in popup to match condition input group
  .more-popup :deep(.input-group) .arco-select-view {
    border-radius: 0 !important;
  }
  .more-popup-content :deep(.arco-form-item-label) {
    min-width: 70px; // or whatever width fits your longest label
    width: 70px;
    display: inline-block;
    text-align: right;
  }
  .field-action {
    padding: 0 8px;
  }
</style>
