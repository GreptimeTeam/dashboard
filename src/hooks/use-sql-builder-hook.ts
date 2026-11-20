import { computed, type Ref, reactive } from 'vue'
import type { Condition, BuilderFormState, TSColumn } from '@/types/query'
import { jsonAttributeValueKind } from '@/observability/filters'
import { sqlJsonAttrExpr } from '@/observability/logs/json-field-keys'
import type { DrilldownFilterOp } from '@/observability/types'
import { getTableRefForSql } from '@/utils/sql'

export interface SqlBuilderHookOptions {
  /** Time range values for SQL generation */
  timeRangeValues: Ref<string[]>
  /** Timestamp column for time-based filtering */
  tsColumn?: Ref<TSColumn | null>
  /** Default form state */
  defaultFormState?: Partial<BuilderFormState> | null
}

export function useSqlBuilderHook(options: SqlBuilderHookOptions) {
  const { timeRangeValues, tsColumn, defaultFormState } = options
  const initState = {
    table: '',
    conditions: [],
    orderByField: '',
    orderBy: 'DESC' as 'DESC' | 'ASC',
    limit: 1000,
    tsColumn: null,
    ...defaultFormState,
  }
  // Initialize builder form state as reactive
  const builderFormState = reactive<BuilderFormState>({ ...initState })

  function escapeSqlString(value: string) {
    if (typeof value !== 'string') return value
    return value.replace(/'/g, "''")
  }

  function singleCondition(condition: Condition) {
    const { field, operator, value } = condition

    // Helper function to format value based on type
    const formatValue = (val: any, fieldType: Condition['fieldType']) => {
      if (fieldType === 'Number' || fieldType === 'Time') {
        return Number(val)
      }
      if (fieldType === 'Boolean') {
        return val === true || String(val).toLowerCase() === 'true' ? 'TRUE' : 'FALSE'
      }
      return `'${escapeSqlString(val)}'`
    }

    // JSON2 attribute chips have no column: render the JSON path, read as the comparator's
    // type (range operators need a numeric cast, otherwise "1000" sorts before "900").
    const { jsonAttribute } = condition
    // The field type decides the read (a numeric key also casts for IN lists); fall back to
    // the comparator heuristic for string-typed attributes used with range operators.
    let jsonKind = jsonAttributeValueKind(operator as DrilldownFilterOp, String(value ?? ''))
    if (condition.fieldType === 'Number') {
      jsonKind = 'number'
    } else if (condition.fieldType === 'Boolean') {
      jsonKind = 'boolean'
    }
    const target = jsonAttribute ? sqlJsonAttrExpr(jsonAttribute.column, jsonAttribute.path, jsonKind) : `"${field}"`

    switch (operator) {
      case 'LIKE':
        return `${target} LIKE '%${escapeSqlString(String(value))}%'`
      case 'NOT LIKE':
        return `${target} NOT LIKE '%${escapeSqlString(String(value))}%'`
      case 'MATCH':
        return `${target} @@ '${escapeSqlString(String(value))}'`
      case 'NOT MATCH':
        return `NOT ${target} @@ '${escapeSqlString(String(value))}'`
      case 'IN': {
        const inVal = (value as string)
          .split(',')
          .map((v) => formatValue(v.trim(), condition.fieldType))
          .join(',')
        return `${target} IN (${inVal})`
      }
      case 'NOT IN': {
        const inVal = (value as string)
          .split(',')
          .map((v) => formatValue(v.trim(), condition.fieldType))
          .join(',')
        return `${target} NOT IN (${inVal})`
      }
      case 'Exist':
        return `${target} IS NOT NULL`
      case 'Not Exist':
        return `${target} IS NULL`
      default:
        return `${target}${operator}${formatValue(value, condition.fieldType)}`
    }
  }

  function generateSql(formState: BuilderFormState, specialTimeRanges?: any[]): string {
    if (!formState.table) return ''

    const form = formState
    const conditions = form.conditions || []

    // Use passed parameters or store values as fallbacks
    const effectiveTimeRanges = specialTimeRanges !== undefined ? specialTimeRanges : timeRangeValues.value
    const effectiveTimestampColumn = builderFormState.tsColumn

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
        timeCondition = `"${effectiveTimestampColumn.name}" > $timestart`
      } else if (effectiveTimeRanges[1] && !effectiveTimeRanges[0]) {
        timeCondition = `"${effectiveTimestampColumn.name}" < $timeend`
      } else if (effectiveTimeRanges[0] && effectiveTimeRanges[1]) {
        timeCondition = `"${effectiveTimestampColumn.name}" <= $timeend AND "${effectiveTimestampColumn.name}" >= $timestart`
      }

      if (timeCondition && timeConditions.length > 0) {
        timeConditions.push(`AND ${timeCondition}`)
      } else if (timeCondition) {
        timeConditions.push(timeCondition)
      }
    }

    const tableName = getTableRefForSql({ table: form.table, database: form.database })
    let sql = `SELECT * FROM ${tableName}`
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

  return {
    builderFormState,
    addFilterCondition,
    generateSql,
    defaultFormState: initState,
  }
}

export default useSqlBuilderHook
