<template lang="pug">
a-form(
  layout="horizontal"
  label-align="left"
  size="small"
  auto-label-width
  :model="form"
)
  a-form-item(label="Table")
    a-select(
      v-model="form.table"
      style="width: auto"
      placeholder="Select table"
      :allow-search="true"
      :trigger-props="{ autoFitPopupMinWidth: true }"
      :options="tables"
      @change="handleTableChange"
    )
  a-form-item(label="Where")
    .condition-wrapper
      a-space(v-for="(condition, index) in form.conditions" :key="index")
        a-input-group.input-group
          a-select(
            v-if="index > 0"
            v-model="condition.relation"
            style="width: auto"
            :options="['AND', 'OR']"
          )
          a-select.field(
            v-model="condition.field"
            allow-search
            placeholder="field"
            style="width: auto"
            :trigger-props="{ autoFitPopupMinWidth: true }"
            :options="fieldsOptions"
          )
          a-select.operator(
            v-model="condition.operator"
            placeholder="operator"
            style="width: auto"
            :trigger-props="{ autoFitPopupMinWidth: true }"
            :options="getOperators(condition.field)"
          )
          a-input.value(
            v-if="condition.operator !== 'Not Exist' && condition.operator !== 'Exist'"
            v-model="condition.value"
            placeholder="value"
          )
          a-button(@click="() => removeCondition(index)")
            icon-minus(style="cursor: pointer; font-size: 14px")

      a-button(type="text" @click="addCondition")
        icon-plus(style="cursor: pointer; font-size: 14px")
  a-form-item(label="Order By")
    a-space
      a-select(
        v-model="form.orderByField"
        style="width: 200px"
        placeholder="Select field"
        allow-search
        :options="fieldsOptions"
        :trigger-props="{ autoFitPopupMinWidth: true }"
      )
      a-select(
        v-model="form.orderBy"
        style="width: 120px"
        placeholder="Order"
        :options="orderOptions"
      )
  a-form-item(label="Limit")
    a-input-number(
      v-model="form.limit"
      style="width: 200px"
      placeholder="Limit"
      :step="100"
      :min="1"
      :max="1000"
    )
</template>

<script setup name="SQLBuilder" lang="ts">
  import { ref, watch, onMounted, computed, readonly, reactive } from 'vue'
  import { storeToRefs } from 'pinia'
  import editorAPI from '@/api/editor'
  import { useAppStore } from '@/store'

  interface Condition {
    field: string
    operator: string
    value: string
    relation?: 'AND' | 'OR'
    isTimeColumn?: boolean
  }

  interface Form {
    conditions: Condition[]
    orderByField: string
    orderBy: string
    limit: number
    table: string
  }

  interface TableField {
    name: string
    data_type: string
    semantic_type: string
  }

  const emit = defineEmits(['update:sql', 'update:form'])

  // Props for timeLength and initial form state
  const props = defineProps<{
    initialFormState?: Form | null
    tableFilter?: string // Optional filter for which tables to show (e.g., 'trace_id' for traces)
    timeRangeValues?: string[] // Pre-processed time range values [start, end] - unified for all systems
  }>()

  const tables = ref<string[]>([])
  const tableMap = ref<{ [key: string]: TableField[] }>({})

  // Get current database from app store
  const { database } = storeToRefs(useAppStore())

  // Use initial form state from props if provided, otherwise use default
  const defaultFormState: Form = {
    conditions: [
      {
        field: 'parent_span_id',
        operator: 'Not Exist',
        value: '',
      },
    ],
    orderByField: '',
    orderBy: 'DESC',
    limit: 1000,
    table: '',
  }

  // Initialize form state as reactive object
  const form = reactive<Form>(props.initialFormState || defaultFormState)

  // Watch for prop changes and update form
  watch(
    () => props.initialFormState,
    (newFormState) => {
      if (newFormState) {
        Object.assign(form, newFormState)
      }
    },
    { immediate: true }
  )

  // Watch form changes and emit updates for URL persistence
  watch(
    form,
    (newForm) => {
      emit('update:form', newForm)
    },
    { deep: true }
  )

  const fields = computed(() => {
    if (!form.table || !tableMap.value[form.table]) return []
    return tableMap.value[form.table]
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

  const orderOptions = [
    { label: 'ASC', value: 'ASC' },
    { label: 'DESC', value: 'DESC' },
  ]

  // Operator mapping based on field data type (similar to log query)
  const operatorMap = {
    String: ['=', '!=', 'LIKE', 'NOT LIKE', 'Not Exist', 'Exist'],
    Number: ['=', '!=', '>', '>=', '<', '<=', 'Not Exist', 'Exist'],
    Time: ['>', '>=', '<', '<=', 'Not Exist', 'Exist'],
    Boolean: ['=', '!=', 'Not Exist', 'Exist'],
    Default: ['=', '!=', '>', '<', '>=', '<=', 'LIKE', 'NOT LIKE', 'Not Exist', 'Exist'],
  }

  function getFieldType(fieldName: string): string {
    const field = fields.value.find((f) => f.name === fieldName)
    if (!field) return 'Default'

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
    if (dataType.includes('string') || dataType.includes('varchar') || dataType.includes('text')) {
      return 'String'
    }

    return 'Default'
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
      let sql = `SELECT DISTINCT table_name FROM information_schema.columns WHERE table_schema = '${database.value}'`

      // Add filter if specified (e.g., for traces we want tables with trace_id column)
      if (props.tableFilter) {
        sql += ` AND column_name = '${props.tableFilter}'`
      }

      sql += ` ORDER BY table_name`

      const result = await editorAPI.runSQL(sql)
      tables.value = result.output[0].records.rows.map((row: string[]) => row[0])

      // Only set default table if we don't have initial form state from props
      if (!props.initialFormState && tables.value.length > 0) {
        form.table = tables.value[0]
      }
    } catch (error) {
      console.error('Failed to fetch tables:', error)
    }
  }

  async function fetchTableFields(tableName: string) {
    if (!tableName) return
    try {
      const result = await editorAPI.runSQL(
        `SELECT column_name, data_type, semantic_type
       FROM information_schema.columns
       WHERE table_name = '${tableName}'
       ORDER BY column_name`
      )
      tableMap.value[tableName] = result.output[0].records.rows.map((row: string[]) => ({
        name: row[0],
        data_type: row[1],
        semantic_type: row[2],
      }))
    } catch (error) {
      console.error('Failed to fetch table fields:', error)
    }
  }

  function handleTableChange() {
    form.conditions = []
    form.orderByField = ''
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
    })
  }

  function removeCondition(index: number) {
    form.conditions.splice(index, 1)
  }

  // Internal time range processing - unified logic for all consumers
  function processTimeRange(sql: string): string {
    // Handle pre-processed time range values - unified for all systems
    if (props.timeRangeValues && props.timeRangeValues.length === 2) {
      const [start, end] = props.timeRangeValues
      return sql.replace(/\$timestart/g, start).replace(/\$timeend/g, end)
    }

    return sql
  }

  function escapeSqlString(value: string) {
    if (typeof value !== 'string') {
      return value // Only escape if it's a string
    }

    // Replace common SQL special characters with their escaped versions
    return value
      .replace(/\\/g, '\\\\') // Escape backslashes
      .replace(/'/g, "''") // Escape single quotes by doubling
      .replace(/\n/g, '\\n') // Escape newline
      .replace(/\r/g, '\\r') // Escape carriage return
  }

  function singleCondition(condition: Condition) {
    const column = condition.field
    const columnType = getFieldType(column)
    const conditionVal = escapeSqlString(condition.value)
    let columnName = condition.field
    columnName = `"${columnName}"`
    if (condition.operator === 'Exist') {
      return `${columnName} is not null`
    }
    if (condition.operator === 'Not Exist') {
      return `${columnName} is null`
    }
    if (columnType === 'Number' || columnType === 'Time') {
      return `${columnName} ${condition.operator} ${condition.value}`
    }
    if (condition.operator === 'like') {
      // return `MATCHES(${columnName},'"${escapeSqlString(condition.value)}"')`
      return `${columnName} like '%${conditionVal}%'`
    }
    if (['contains', 'not contains', 'match sequence'].indexOf(condition.operator) > -1) {
      let val = escapeSqlString(condition.value)
      if (condition.operator === 'not contains') {
        val = `-"${val}"`
      } else if (condition.operator === 'contains') {
        val = `"${val}"`
      }
      return `MATCHES(${columnName},'${val}')`
    }
    return `${columnName} ${condition.operator} '${escapeSqlString(condition.value)}'`
  }

  watch([form, timeColumns, () => props.timeRangeValues], () => {
    if (!form.table) return
    if (!timeColumns.value.length) return
    const availableTimeColumns = timeColumns.value
    const conditions = form.conditions
      .filter((condition) => {
        if (condition.operator === 'Not Exist' || condition.operator === 'Exist') {
          return condition.field
        }
        return condition.field && condition.operator && condition.value
      })
      .map((condition, index) => {
        let conditionStr = singleCondition(condition)
        // Add relation for conditions after the first one
        if (index > 0) {
          conditionStr = `${condition.relation || 'AND'} ${conditionStr}`
        }
        return conditionStr
      })

    // Add timestamp range condition when timeRangeValues is provided
    const timeConditions = [...conditions]
    if (props.timeRangeValues && props.timeRangeValues.length > 0 && availableTimeColumns.length > 0) {
      const firstTimeColumn = availableTimeColumns[0]
      const timeCondition = `${firstTimeColumn.value} <= $timeend AND ${firstTimeColumn.value} > $timestart`

      if (timeConditions.length > 0) {
        timeConditions.push(`AND ${timeCondition}`)
      } else {
        timeConditions.push(timeCondition)
      }
    }

    let sql = `SELECT * FROM "${form.table}"`
    if (timeConditions.length > 0) {
      sql += ` WHERE ${timeConditions.join(' ')}`
    }
    if (form.orderByField) {
      sql += ` ORDER BY "${form.orderByField}" ${form.orderBy}`
    }
    sql += ` LIMIT ${form.limit}`

    // Process time range internally
    if (props.timeRangeValues && props.timeRangeValues.length > 0 && availableTimeColumns.length > 0) {
      sql = processTimeRange(sql)
    }

    emit('update:sql', sql)
  })

  // Load saved state on mount
  onMounted(() => {
    fetchTables()
  })

  watch(
    () => form.table,
    () => {
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
    }

    form.conditions.push(newCondition)
    // SQL will automatically regenerate due to computed property
  }

  // Expose methods for external use
  defineExpose({
    addFilterCondition,
  })
</script>

<style lang="less" scoped>
  .arco-form-item {
    margin-bottom: 10px;
  }

  :deep(.operator .arco-select-view-value) {
    justify-content: center !important;
  }

  .condition-wrapper {
    display: flex;
    gap: 12px;
    align-items: center;
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
</style>
