<template lang="pug">
LogTimePagination(
  :pages="pages"
  :curr-page="currPage"
  :older-loading="olderLoading"
  :newer-loading="newerLoading"
  :left-disabled="leftDisabled"
  :right-disabled="rightDisabled"
  :load-older="loadOlder"
  :load-newer="loadNewer"
  :load-page="loadPage"
)
</template>

<script setup name="Pagination" lang="ts">
  import editorAPI from '@/api/editor'
  import LogTimePagination from '@/components/log-time-pagination/index.vue'
  import { useLogTimePagination } from '@/hooks/use-log-time-pagination'
  import type { ColumnType, QueryState } from '@/types/query'
  import { convertTimestampToMilliseconds } from '@/utils/date-time'
  import { replaceTimePlaceholders } from '@/utils/sql'
  import dayjs from 'dayjs'
  import { computed, toRefs } from 'vue'
  import { toObj } from './until'

  const props = defineProps<{
    rows: any[]
    columns: ColumnType[]
    queryState: QueryState
  }>()

  const emit = defineEmits(['update:rows'])
  const { rows, queryState } = toRefs(props)

  const globalRange = computed(() => {
    const [start, end] = queryState.value.timeRangeValues
    if (!queryState.value.tsColumn || (!start && !end)) {
      return null
    }
    return { start: start as string, end: end as string }
  })

  function toMs(value: number | string) {
    if (!queryState.value.tsColumn || typeof value === 'string') {
      return NaN
    }
    return convertTimestampToMilliseconds(Number(value), queryState.value.tsColumn.data_type)
  }

  function formatDate(value: number | string, dataType: string) {
    const ms = convertTimestampToMilliseconds(Number(value), dataType)
    return dayjs(ms).format('HH:mm:ss')
  }

  function queryPage(pageSql: string, reverse = false) {
    return editorAPI.runSQL(pageSql).then((result) => {
      const rowsTmp = result.output[0].records.rows
      const queryColumns = result.output[0].records.schema.column_schemas
      const arr = []
      if (reverse) {
        for (let i = rowsTmp.length - 1; i >= 0; i -= 1) {
          arr.push(toObj(rowsTmp[i], queryColumns, i, queryState.value.tsColumn))
        }
      } else {
        for (let i = 0; i < rowsTmp.length; i += 1) {
          arr.push(toObj(rowsTmp[i], queryColumns, i, queryState.value.tsColumn))
        }
      }
      return arr
    })
  }

  function paginationOrderBy(intent: 'replay' | 'older' | 'newer') {
    if (intent === 'older') return 'DESC'
    if (intent === 'newer') return 'ASC'
    return queryState.value.sourceState.orderBy || 'DESC'
  }

  function buildPageSql(rangeStart: unknown, rangeEnd: unknown, intent: 'replay' | 'older' | 'newer') {
    const orderBy = paginationOrderBy(intent)
    const sql = queryState.value.generateSql(
      intent === 'replay' ? queryState.value.sourceState : { ...queryState.value.sourceState, orderBy },
      [rangeStart, rangeEnd]
    )
    // SQL WHERE uses `ts <= $timeend`; bump end by 1 unit on replay so the pill's inclusive end is covered.
    const timeEnd = intent === 'replay' ? Number(rangeEnd) + 1 : rangeEnd
    return replaceTimePlaceholders(sql, [rangeStart, timeEnd])
  }

  const { pages, currPage, newerLoading, olderLoading, leftDisabled, rightDisabled, loadPage, loadOlder, loadNewer } =
    useLogTimePagination({
      rows,
      limit: computed(() => queryState.value.limit),
      order: computed(() => queryState.value.orderBy),
      globalRange,
      toMs,
      canLoadOlder(global, oldestBound) {
        return Boolean(queryState.value.tsColumn && global.start && oldestBound !== undefined)
      },
      canLoadNewer(global, newestBound) {
        return Boolean(queryState.value.tsColumn && global.end && newestBound !== undefined)
      },
      onUpdateRows: (nextRows) => {
        emit('update:rows', nextRows)
      },
      handlers: {
        getPageBounds(pageRows, order) {
          if (!pageRows.length || !queryState.value.tsColumn) {
            return null
          }
          const tsName = queryState.value.tsColumn.name as string
          const dataType = queryState.value.tsColumn.data_type
          const first = order === 'ASC' ? pageRows[0] : pageRows[pageRows.length - 1]
          const last = order === 'ASC' ? pageRows[pageRows.length - 1] : pageRows[0]
          return {
            start: first[tsName],
            end: last[tsName],
            label: `${formatDate(first[tsName], dataType)}—${formatDate(last[tsName], dataType)}`,
          }
        },
        fetchRange(range, intent, order, _meta) {
          if (!queryState.value.tsColumn) {
            return Promise.resolve([])
          }
          const pageSql = buildPageSql(range.start, range.end, intent)
          const reverse = (intent === 'older' && order === 'ASC') || (intent === 'newer' && order === 'DESC')
          return queryPage(pageSql, reverse)
        },
      },
    })
</script>
