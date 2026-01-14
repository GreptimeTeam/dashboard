<template lang="pug">
a-modal(
  :visible="visible"
  :title="$t('dashboard.exportCSV')"
  :width="700"
  @ok="handleConfirm"
  @cancel="handleCancel"
)
  template(#footer)
    a-space
      a-button(@click="handleCancel") Cancel
      a-button(type="primary" :loading="loading" @click="handleConfirm")
        | Export
  .export-modal-content
    a-form(layout="vertical")
      a-form-item(:label="$t('logsQuery.exportSql')")
        pre.export-sql-display {{ formattedSql }}
      a-form-item(:label="$t('logsQuery.exportLimit')")
        a-space(style="width: 100%" fill)
          a-input(
            v-model.number="limit"
            type="number"
            style="flex: 1"
            placeholder="Enter limit"
            :min="1"
          )
          template(v-if="totalCount !== null")
            span(style="color: var(--color-text-3); margin-left: 8px; white-space: nowrap")
              | / {{ totalCount }} {{ $t('logsQuery.records') }}
          template(v-else)
            span(style="color: var(--color-text-3); margin-left: 8px; white-space: nowrap")
              | {{ $t('logsQuery.records') }}
</template>

<script setup lang="ts">
  import { ref, computed, watch } from 'vue'
  import { sqlFormatter } from '@/utils/sql'
  import { parseLimit, removeLimitFromSql } from './until'

  interface Props {
    visible: boolean
    sql: string
  }

  const props = defineProps<Props>()

  const emit = defineEmits<{
    (event: 'update:visible', value: boolean): void
    (event: 'confirm', limit: number, formattedSql: string): void
    (event: 'cancel'): void
  }>()

  const limit = ref(1000)
  const loading = ref(false)
  const totalCount = ref<number | null>(null)

  async function fetchTotalCount() {
    if (!props.sql) {
      totalCount.value = null
      return
    }

    try {
      // Extract table name from SQL
      const tableMatch = props.sql.match(/FROM\s+"?(\w+)"?/i)
      if (!tableMatch) {
        totalCount.value = null
        return
      }
      const [, table] = tableMatch

      // Extract WHERE clause from the SQL
      const whereMatch = props.sql.match(/WHERE\s+([\s\S]+?)(?:\s+ORDER\s+BY|\s+LIMIT\s+|\s*$)/i)
      const [, whereCondition] = whereMatch || []
      const whereClause = whereCondition ? `WHERE ${whereCondition}` : ''

      // Build COUNT query
      const countSql = `SELECT COUNT(*) FROM "${table}" ${whereClause}`

      const { default: editorAPI } = await import('@/api/editor')
      const result: any = await editorAPI.runSQL(countSql)

      if (result.output?.[0]?.records) {
        const { records } = result.output[0]
        if (records.rows?.[0]?.[0] !== undefined) {
          totalCount.value = Number(records.rows[0][0])
        } else {
          totalCount.value = null
        }
      } else {
        totalCount.value = null
      }
    } catch (error) {
      console.error('Failed to get export total count:', error)
      totalCount.value = null
    }
  }

  // Format SQL: remove LIMIT and format
  const formattedSql = computed(() => {
    if (!props.sql) return ''
    const sql = removeLimitFromSql(props.sql)
    // Format SQL
    return sqlFormatter(sql)
  })

  // Get default limit from original SQL
  const defaultLimit = computed(() => {
    if (!props.sql) return 1000
    return parseLimit(props.sql) || 1000
  })

  // Watch for SQL changes to update limit
  watch(
    () => props.sql,
    (newSql) => {
      if (newSql) {
        limit.value = parseLimit(newSql) || 1000
        // Fetch total count when SQL changes
        fetchTotalCount()
      }
    },
    { immediate: true }
  )

  // Watch for visible changes to reset state
  watch(
    () => props.visible,
    (newVisible) => {
      if (newVisible) {
        limit.value = defaultLimit.value
        fetchTotalCount()
      }
    }
  )

  function handleConfirm() {
    const limitValue = Number(limit.value)
    if (!limitValue || limitValue < 1 || Number.isNaN(limitValue)) {
      return
    }
    emit('confirm', limitValue, formattedSql.value)
  }

  function handleCancel() {
    emit('update:visible', false)
    emit('cancel')
  }
</script>

<style lang="less" scoped>
  .export-modal-content {
    padding: 8px 0;
  }
  .export-sql-display {
    width: 100%;
    height: 200px;
    padding: 12px;
    margin: 0;
    border: 1px solid var(--color-border);
    border-radius: 4px;
    background-color: var(--color-fill-1);
    font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', 'Consolas', 'source-code-pro', monospace;
    font-size: 13px;
    line-height: 1.6;
    color: var(--color-text-1);
    overflow: auto;
    white-space: pre-wrap;
    word-wrap: break-word;
  }
</style>
