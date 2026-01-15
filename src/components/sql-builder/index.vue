<template lang="pug">
// First row: Database and Table
a-form(
  layout="inline"
  label-align="left"
  size="small"
  :model="form"
)
  a-form-item(:label="t('sqlBuilder.database')")
    a-select(
      v-model="form.database"
      style="min-width: 120px; width: auto"
      :placeholder="t('sqlBuilder.selectDatabase')"
      :allow-search="true"
      :trigger-props="{ autoFitPopupMinWidth: true }"
      :options="filteredDatabaseList"
      @change="handleDatabaseChange"
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

// Second row: Filters
a-form.second-row-form(
  layout="inline"
  label-align="left"
  size="small"
  :model="form"
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
            .resizable-wrapper(v-else)
              a-input.value(
                v-model="condition.value"
                style="width: 100%"
                :placeholder="condition.operator === 'IN' || condition.operator === 'NOT IN' ? t('sqlBuilder.commaValuesHint') : t('sqlBuilder.value')"
              )
          a-button.field-action(@click="() => removeCondition(index)")
            icon-minus(style="cursor: pointer; font-size: 14px")

      a-button.field-action(@click="addCondition")
        icon-plus(style="cursor: pointer; font-size: 14px")

// Third row: Order By, Limit, and Quick Filters
a-form.third-row-form(
  layout="inline"
  label-align="left"
  size="small"
  :model="form"
)
  // Order By
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
  // Limit
  a-form-item(:label="t('sqlBuilder.limit')")
    a-input-number(
      v-model="form.limit"
      style="width: 80px"
      :placeholder="t('sqlBuilder.limit')"
      :step="100"
      :min="1"
      :max="10000"
    )

  // Quick Filters
  a-form-item(:label="t('quickFilters.title')")
    .quick-filters-content
      div(style="display: flex; flex-wrap: wrap; gap: 8px; align-items: center")
        a-tag(
          v-for="quickFilter in savedQuickFilters"
          :key="quickFilter.name"
          style="cursor: pointer"
          :closable="true"
          @click="onApplyQuickFilter(quickFilter)"
          @close="removeQuickFilter(quickFilter.name)"
        )
          span(:title="t('quickFilters.clickToApplyTitle')") {{ quickFilter.name }}
        a-tag.quick-fields-save(type="text" style="cursor: pointer" @click="showSaveQuickFilter = true")
          template(#icon)
            icon-plus
          | {{ t('quickFilters.saveCurrentSearch') }}

// Save Quick Filter Modal
a-modal(
  v-model:visible="showSaveQuickFilter"
  :title="t('quickFilters.saveModalTitle')"
  :width="500"
  :on-before-ok="saveCurrentAsQuickFilter"
  @cancel="showSaveQuickFilter = false"
)
  a-form(
    ref="saveQuickFilterFormRef"
    layout="vertical"
    :model="saveQuickFilterForm"
    :rules="saveQuickFilterRules"
  )
    a-form-item(field="name" :label="t('quickFilters.name')")
      a-input(v-model="saveQuickFilterForm.name" maxlength="50" :placeholder="t('quickFilters.namePlaceholder')")
    a-form-item(field="description" :label="t('quickFilters.description')")
      a-descriptions(
        size="small"
        bordered
        layout="vertical"
        style="width: 100%"
        :column="1"
      )
        a-descriptions-item(:label="t('quickFilters.table')")
          a-tag(color="blue") {{ form.table }}
        a-descriptions-item(v-if="form.conditions.length > 0" :label="t('quickFilters.conditions')")
          .conditions-list
            a-tag(
              v-for="(condition, index) in form.conditions"
              :key="index"
              color="green"
              style="margin-bottom: 4px; margin-right: 4px"
            )
              | {{ condition.field }} {{ condition.operator }} {{ condition.value }}
        a-descriptions-item(v-else :label="t('quickFilters.conditions')")
          a-tag(color="gray") {{ t('quickFilters.noConditions') }}
</template>

<script setup name="SQLBuilder" lang="ts">
  import { ref, watch, onMounted, computed, reactive, nextTick } from 'vue'
  import { useI18n } from 'vue-i18n'
  import { useLocalStorage } from '@vueuse/core'
  import { storeToRefs } from 'pinia'
  import editorAPI from '@/api/editor'
  import { useAppStore } from '@/store'
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
    database?: string // Optional database field for quick filters
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
  const { database, tableCatalog, tableSchema, databaseList } = storeToRefs(useAppStore())
  const appStore = useAppStore()

  // Filter out system databases (greptime_private, information_schema)
  const filteredDatabaseList = computed(() => {
    return databaseList.value.filter((db) => db !== 'greptime_private' && db !== 'information_schema')
  })

  // Use localStorage to remember the last selected table
  const storageKey = props.storageKey || 'sql-builder-last-table'
  const lastSelectedTable = useLocalStorage(storageKey, '')

  // Initialize form state as reactive object
  const form = reactive<Form>(props.formState)

  // Computed tableCatalog and tableSchema based on form.database
  const currentTableCatalog = computed(() => {
    if (!form.database) return 'greptime'
    return form.database.split('-').slice(0, -1).join('-') || 'greptime'
  })
  const currentTableSchema = computed(() => {
    if (!form.database) return ''
    return form.database.split('-').slice(-1).join('-')
  })
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

  watchEffect(() => {
    console.log('form.database', form.database, form.table, fields.value)
  })

  const fieldsOptions = computed(() => {
    return fields.value.map((column) => ({
      label: column.name,
      value: column.name,
    }))
  })

  // Quick Filters logic (after form and fields are defined)
  const quickFiltersStorageKey = computed(() => `${storageKey}-quick-filters`)
  const clearedFiltersKey = computed(() => `${storageKey}-filters-cleared`)
  let savedQuickFilters = useLocalStorage(quickFiltersStorageKey.value, [] as QuickFilter[])
  const userClearedFilters = useLocalStorage(clearedFiltersKey.value, false)

  const showSaveQuickFilter = ref(false)
  const saveQuickFilterFormRef = ref()
  const saveQuickFilterForm = reactive({ name: '' })

  const saveQuickFilterRules = {
    name: [
      { required: true, message: t('quickFilters.nameRequired') },
      { minLength: 2, message: t('quickFilters.nameMin') },
      { maxLength: 50, message: t('quickFilters.nameMax') },
      {
        validator: (value: string, cb: (msg?: string) => void) => {
          const trimmedName = value.trim().toLowerCase()
          const existingFilter = savedQuickFilters.value.find((filter) => filter.name.toLowerCase() === trimmedName)
          if (existingFilter) {
            cb(t('quickFilters.nameExists'))
          } else {
            cb()
          }
        },
      },
    ],
  }

  function createDefaultQuickFilters(): QuickFilter[] {
    if (!props.quickFieldNames || !form.table || !fields.value.length) return []
    return props.quickFieldNames
      .filter((fieldName) => fields.value.some((field) => field.name === fieldName))
      .map((fieldName) => {
        const field = fields.value.find((f) => f.name === fieldName)
        const isTimeCol = field?.data_type.toLowerCase().includes('timestamp') || false
        const defaultOperator = '='
        return {
          name: fieldName,
          table: form.table,
          database: form.database,
          conditions: [
            {
              field: fieldName,
              operator: defaultOperator,
              value: '',
              isTimeColumn: isTimeCol,
              relation: 'AND',
            },
          ],
          orderByField: form.orderByField,
          orderBy: form.orderBy,
          limit: form.limit,
          createdAt: Date.now(),
        }
      })
  }

  function initializeQuickFilters() {
    // Only initialize default filters if user hasn't manually cleared them
    if (savedQuickFilters.value.length === 0 && !userClearedFilters.value && props.quickFieldNames) {
      const defaults = createDefaultQuickFilters()
      if (defaults.length > 0) {
        savedQuickFilters.value = defaults
      }
    }
  }

  watch(
    () => [fields.value, form.table],
    () => {
      savedQuickFilters = useLocalStorage(quickFiltersStorageKey.value, [] as QuickFilter[])
      nextTick(() => {
        initializeQuickFilters()
      })
    }
  )

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
      let sql = `SELECT DISTINCT table_name FROM information_schema.columns WHERE table_catalog = '${currentTableCatalog.value}' AND table_schema = '${currentTableSchema.value}'`

      // Add filter if specified (e.g., for traces we want tables with trace_id column)
      if (props.tableFilter) {
        sql += ` AND column_name = '${props.tableFilter}'`
      }

      sql += ` ORDER BY table_name`

      const result = await editorAPI.runSQL(sql, form.database)
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
      const result = await editorAPI.getTableSchema(tableName, form.database)
      tableMap.value[tableName] = result
    } catch (error) {
      console.error('Failed to fetch table fields:', error)
    }
  }

  function handleDatabaseChange() {
    // Reset form state when database changes
    form.table = ''
    tables.value = []
    tableMap.value = {}
    // Fetch tables for the new database (will be triggered by watch)
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

  // Initialize database list and form.database on mount
  onMounted(async () => {
    // Fetch databases if not already loaded
    if (databaseList.value.length === 0) {
      await appStore.fetchDatabases()
    }
    // Initialize form.database if not set or not in filtered list
    if (!form.database || !filteredDatabaseList.value.includes(form.database)) {
      form.database = filteredDatabaseList.value[0] || database.value
    }
  })

  // Watch form.database changes to fetch tables
  watch(
    () => form.database,
    (newDatabase, oldDatabase) => {
      if (newDatabase) {
        // Only fetch tables if database actually changed (not during initial setup)
        if (oldDatabase && oldDatabase !== newDatabase) {
          form.table = ''
          tables.value = []
          tableMap.value = {}
          form.orderByField = ''
        }
        fetchTables()
      }
    },
    { immediate: true }
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

  async function saveCurrentAsQuickFilter() {
    await nextTick()
    return (saveQuickFilterFormRef.value as any).validate().then((errors: any) => {
      if (errors) return false
      const newQuickFilter: QuickFilter = {
        name: saveQuickFilterForm.name.trim(),
        table: form.table,
        database: form.database,
        conditions: [...form.conditions],
        orderByField: form.orderByField,
        orderBy: form.orderBy,
        limit: form.limit,
        createdAt: Date.now(),
      }
      savedQuickFilters.value.push(newQuickFilter)

      // Reset the cleared flag since user is actively using filters
      userClearedFilters.value = false

      saveQuickFilterForm.name = ''
      showSaveQuickFilter.value = false
      return true
    })
  }

  // Function to apply a saved quick filter
  async function applyQuickFilter(quickFilter: QuickFilter) {
    // Switch to the saved database if different and valid
    if (quickFilter.database && quickFilter.database !== form.database) {
      if (filteredDatabaseList.value.includes(quickFilter.database)) {
        form.database = quickFilter.database
      }
    }

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

  function onApplyQuickFilter(quickFilter: QuickFilter) {
    applyQuickFilter(quickFilter)
  }

  function removeQuickFilter(filterId: string) {
    const idx = savedQuickFilters.value.findIndex((filter) => filter.name === filterId)
    if (idx !== -1) {
      savedQuickFilters.value.splice(idx, 1)
      // Mark that user has manually cleared filters
      if (savedQuickFilters.value.length === 0) {
        userClearedFilters.value = true
      }
    }
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
    width: 90px; // Fixed width for labels (to accommodate "Quick Filters")
    min-width: 90px;
  }
  :deep(.arco-form-item-label) {
    min-width: 70px;
    text-align: right;
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

  .quick-filters-content {
    width: 100%;
  }

  // Resizable wrapper for input
  .resizable-wrapper {
    display: inline-block;
    width: 140px;
    min-width: 60px;
    max-width: 600px;
    resize: horizontal;
    overflow: hidden;
    vertical-align: middle;
    // Ensure the resize handle is visible and usable
    padding-right: 5px;
  }
</style>
