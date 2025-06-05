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
      :options="tables"
      @change="handleTableChange"
    )
  a-form-item(label="Where")
    .condition-list
      .condition-item(v-for="(condition, index) in form.conditions" :key="index")
        a-space
          a-select(
            v-if="condition.isTimeColumn"
            v-model="condition.field"
            style="width: auto"
            placeholder="Select field"
            :options="fieldsOptions"
          )
          a-select(
            v-else
            v-model="condition.field"
            style="width: auto"
            placeholder="Select field"
            :options="fieldsOptions"
          )
          a-select(
            v-model="condition.operator"
            style="width: auto"
            placeholder="Operator"
            :options="getOperators(condition.field)"
          )
          template(v-if="!condition.isTimeColumn && !isSpecialTimeOperator(condition.operator)")
            a-input(
              v-model="condition.value"
              style="width: auto"
              placeholder="Value"
              :disabled="isSpecialTimeOperator(condition.operator)"
            )

          a-button(
            v-if="form.conditions.length > 0"
            type="text"
            status="danger"
            @click="removeCondition(index)"
          )
            template(#icon)
              icon-delete
          icon-plus(style="cursor: pointer; font-size: 14px" @click="addCondition")
      icon-plus(v-if="form.conditions.length < 1" style="cursor: pointer; font-size: 14px" @click="addCondition")
  a-form-item(label="Order By")
    a-space
      a-select(
        v-model="form.orderByField"
        style="width: 200px"
        placeholder="Select field"
        :options="timeColumns"
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
      :min="1"
      :max="1000"
    )
</template>

<script setup name="TraceSQLBuilder" lang="ts">
  import { ref, watch, onMounted, computed } from 'vue'
  import { useStorage } from '@vueuse/core'
  import editorAPI from '@/api/editor'

  interface Condition {
    field: string
    operator: string
    value: string
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

  const emit = defineEmits(['update:sql', 'update:table'])

  const tables = ref<string[]>([])
  const tableMap = ref<{ [key: string]: TableField[] }>({})

  // Use useStorage for form state
  const form = useStorage<Form>('trace-sql-builder-form', {
    conditions: [],
    orderByField: '',
    orderBy: 'DESC',
    limit: 100,
    table: '',
  })

  const fields = computed(() => {
    if (!form.value.table || !tableMap.value[form.value.table]) return []
    return tableMap.value[form.value.table]
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

  const timeOperators = [
    { label: 'Between TimeRange', value: 'BETWEEN_TIME' },
    { label: 'Any time', value: 'ANY_TIME' },
    { label: '>=', value: '>=' },
    { label: '<=', value: '<=' },
  ]

  const normalOperators = [
    { label: '=', value: '=' },
    { label: '!=', value: '!=' },
    { label: '>', value: '>' },
    { label: '<', value: '<' },
    { label: '>=', value: '>=' },
    { label: '<=', value: '<=' },
    { label: 'LIKE', value: 'LIKE' },
    { label: 'NOT LIKE', value: 'NOT LIKE' },
  ]

  function getOperators(field: string) {
    if (field.toLowerCase().includes('time')) {
      return timeOperators
    }
    return normalOperators
  }

  function isSpecialTimeOperator(operator: string) {
    return operator === 'BETWEEN_TIME' || operator === 'ANY_TIME'
  }

  async function fetchTables() {
    try {
      const result = await editorAPI.runSQL(
        `SELECT DISTINCT table_name
       FROM information_schema.columns
       WHERE table_schema = 'public'
       ORDER BY table_name`
      )
      tables.value = result.output[0].records.rows.map((row: string[]) => row[0])
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
    form.value.conditions = []
    form.value.orderByField = ''
  }

  // Watch for timeColumns changes to add default time range condition
  watch(timeColumns, (newTimeColumns) => {
    if (form.value.table && newTimeColumns.length > 0) {
      const firstTimeColumn = newTimeColumns[0]
      if (form.value.conditions.length === 0) {
        form.value.conditions = [
          {
            field: firstTimeColumn.value,
            operator: 'BETWEEN_TIME',
            value: '',
            isTimeColumn: true,
          },
        ]
      }
      if (!form.value.orderByField) {
        form.value.orderByField = firstTimeColumn.value
      }
    }
  })

  function addCondition() {
    form.value.conditions.push({
      field: '',
      operator: '=',
      value: '',
      isTimeColumn: false,
    })
  }

  function removeCondition(index: number) {
    form.value.conditions.splice(index, 1)
  }

  function generateSQL() {
    const conditions = form.value.conditions
      .filter((condition) => {
        if (condition.isTimeColumn) {
          return condition.field && (isSpecialTimeOperator(condition.operator) || condition.value)
        }
        return condition.field && condition.operator && condition.value
      })
      .map((condition) => {
        if (condition.isTimeColumn) {
          switch (condition.operator) {
            case 'BETWEEN_TIME':
              return `${condition.field} < '$timeend' AND ${condition.field} > '$timestart'`
            case 'ANY_TIME':
              return `1=1` // Always true condition
            default:
              return `${condition.field} ${condition.operator} '${condition.value}'`
          }
        }
        if (condition.operator === 'LIKE' || condition.operator === 'NOT LIKE') {
          return `${condition.field} ${condition.operator} '%${condition.value}%'`
        }
        return `${condition.field} ${condition.operator} '${condition.value}'`
      })

    let sql = `SELECT trace_id as traceId, service_name as serviceName, span_name as operationName, timestamp as startTime, duration_nano as duration FROM ${form.value.table}`
    if (conditions.length > 0) {
      sql += ` WHERE ${conditions.join(' AND ')}`
    }
    if (form.value.orderByField) {
      sql += ` ORDER BY ${form.value.orderByField} ${form.value.orderBy}`
    }
    sql += ` LIMIT ${form.value.limit}`

    return sql
  }

  // Watch for form changes and emit SQL updates
  watch(
    () => form.value,
    () => {
      emit('update:sql', generateSQL())
    },
    { immediate: true, deep: true }
  )

  // Load saved state on mount
  onMounted(() => {
    fetchTables()
  })

  watch(
    () => form.value.table,
    () => {
      fetchTableFields(form.value.table)
      emit('update:table', form.value.table)
    },
    { immediate: true }
  )
</script>

<style lang="less" scoped>
  .arco-form-item {
    margin-bottom: 10px;
  }

  :deep(.operator .arco-select-view-value) {
    justify-content: center !important;
  }

  .condition-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .condition-item {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  :deep(.arco-input-append) {
    padding: 0 4px;
  }

  :deep(.arco-select-view-input) {
    width: 100px;
  }
</style>
