import { computed, type Ref, reactive, watchEffect } from 'vue'
import { TSColumn } from '@/views/dashboard/logs/query/types'
import { Condition, BuilderFormState } from '@/types/query'

export interface SqlBuilderHookOptions {
  /** Time range values for SQL generation */
  timeRangeValues: Ref<string[]>
  /** Timestamp column for time-based filtering */
  tsColumn?: Ref<TSColumn | null>
  /** Storage key for persisting form state */
  storageKey?: string
  /** Default form state */
  defaultFormState?: Partial<BuilderFormState>
}

export function useSqlBuilderHook(options: SqlBuilderHookOptions) {
  const { timeRangeValues, tsColumn, storageKey, defaultFormState } = options

  // Initialize builder form state
  const builderFormState = reactive<BuilderFormState>({
    table: '',
    conditions: [],
    orderByField: '',
    orderBy: 'DESC',
    limit: 1000,
    tsColumn: null,
    ...defaultFormState,
  })

  // Persist form state to localStorage if storageKey is provided
  if (storageKey) {
    const savedState = localStorage.getItem(`${storageKey}-form-state`)
    if (savedState) {
      try {
        const parsed = JSON.parse(savedState)
        Object.assign(builderFormState, parsed)
      } catch (error) {
        console.warn('Failed to parse saved form state:', error)
      }
    }

    // Watch for changes and save to localStorage
    watchEffect(() => {
      localStorage.setItem(`${storageKey}-form-state`, JSON.stringify(builderFormState))
    })
  }

  function escapeSqlString(value: string) {
    if (typeof value !== 'string') return value
    return value.replace(/'/g, "''")
  }

  function getFieldType(fieldName: string): string {
    // This could be enhanced to get actual field types from schema
    if (fieldName.toLowerCase().includes('time') || fieldName.toLowerCase().includes('ts')) {
      return 'TIMESTAMP'
    }
    return 'STRING'
  }

  function singleCondition(condition: Condition) {
    const { field, operator, value } = condition
    const fieldType = getFieldType(field)

    switch (operator) {
      case '=':
        if (fieldType === 'TIMESTAMP') {
          return `"${field}" = ${value}`
        }
        return `"${field}" = '${escapeSqlString(value)}'`
      case '!=':
        if (fieldType === 'TIMESTAMP') {
          return `"${field}" != ${value}`
        }
        return `"${field}" != '${escapeSqlString(value)}'`
      case '>':
        return `"${field}" > ${value}`
      case '>=':
        return `"${field}" >= ${value}`
      case '<':
        return `"${field}" < ${value}`
      case '<=':
        return `"${field}" <= ${value}`
      case 'LIKE':
        return `"${field}" LIKE '%${escapeSqlString(value)}%'`
      case 'NOT LIKE':
        return `"${field}" NOT LIKE '%${escapeSqlString(value)}%'`
      case 'IN':
        if (Array.isArray(value)) {
          const escapedValues = value.map((v) => `'${escapeSqlString(v)}'`).join(', ')
          return `"${field}" IN (${escapedValues})`
        }
        return `"${field}" IN ('${escapeSqlString(value)}')`
      case 'NOT IN':
        if (Array.isArray(value)) {
          const escapedValues = value.map((v) => `'${escapeSqlString(v)}'`).join(', ')
          return `"${field}" NOT IN (${escapedValues})`
        }
        return `"${field}" NOT IN ('${escapeSqlString(value)}')`
      case 'Exist':
        return `"${field}" IS NOT NULL`
      case 'Not Exist':
        return `"${field}" IS NULL`
      default:
        return `"${field}" ${operator} '${escapeSqlString(value)}'`
    }
  }

  function generateSql(formState: BuilderFormState, specialTimeRanges?: any[]): string {
    if (!formState.table) return ''

    const form = formState
    const conditions = form.conditions || []

    // Use passed parameters or store values as fallbacks
    const effectiveTimeRanges = specialTimeRanges !== undefined ? specialTimeRanges : timeRangeValues.value
    const effectiveTimestampColumn = tsColumn?.value

    // Process conditions
    const processedConditions = conditions
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

    // Add timestamp range condition when timeRanges is provided
    const timeConditions = [...processedConditions]
    if (effectiveTimeRanges && effectiveTimeRanges.length > 0 && effectiveTimestampColumn) {
      let timeCondition = ''
      if (effectiveTimeRanges[0] && !effectiveTimeRanges[1]) {
        timeCondition = `${effectiveTimestampColumn.name} > $timestart`
      } else if (effectiveTimeRanges[1] && !effectiveTimeRanges[0]) {
        timeCondition = `${effectiveTimestampColumn.name} < $timeend`
      } else if (effectiveTimeRanges[0] && effectiveTimeRanges[1]) {
        timeCondition = `${effectiveTimestampColumn.name} <= $timeend AND ${effectiveTimestampColumn.name} >= $timestart`
      }

      if (timeCondition && timeConditions.length > 0) {
        timeConditions.push(`AND ${timeCondition}`)
      } else if (timeCondition) {
        timeConditions.push(timeCondition)
      }
    }

    // Build SQL
    let sql = `SELECT * FROM "${form.table}"`
    if (timeConditions.length > 0) {
      sql += ` WHERE ${timeConditions.join(' ')}`
    }
    if (form.orderByField) {
      sql += ` ORDER BY "${form.orderByField}" ${form.orderBy || 'DESC'}`
    }
    sql += ` LIMIT ${form.limit}`

    return sql
  }

  // Add filter condition method
  function addFilterCondition(columnName: string, operator: string, value: string) {
    const newCondition: Condition = {
      field: columnName,
      operator,
      value: String(value),
      relation: 'AND',
      isTimeColumn: false,
    }

    if (!builderFormState.conditions) {
      builderFormState.conditions = []
    }

    builderFormState.conditions.push(newCondition)
  }

  // Computed builder SQL
  const builderSql = computed(() => {
    return generateSql(builderFormState, timeRangeValues.value)
  })

  return {
    builderFormState,
    builderSql,
    addFilterCondition,
    generateSql,
  }
}
