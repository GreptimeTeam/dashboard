<template lang="pug">
a-space(v-if="pages.length")
  a-button.btn(size="small" :loading="olderLoading" @click="loadOlder")
    icon-left
    | {{ $t('logsQuery.older') }}
  a-space(style="overflow-x: auto; max-width: 55vw")
    a-tooltip(
      v-for="(page, index) in pages"
      :key="index"
      position="top"
      :content="$t('logsQuery.clickToQuery')"
    )
      a-button.btn(
        type="text"
        size="small"
        :loading="page.loading"
        :class="{ active: page.start == currPage.start && page.end == currPage.end }"
        @click="() => loadPage(page.start, page.end, index)"
      )
        | {{ page.label }}
  a-button.btn(size="small" :loading="newerLoading" @click="loadNewer")
    | {{ $t('logsQuery.newer') }}
    icon-right
  a-tooltip(position="top" :content="$t('logsQuery.timeRangePagination')")
    a-button.btn-hint(type="text" size="small")
      icon-info-circle
</template>

<script setup name="Pagination" lang="ts">
  import { ref, nextTick } from 'vue'
  import editorAPI from '@/api/editor'
  import type { SchemaType } from '@/store/modules/code-run/types'
  import type { QueryState, ColumnType } from '@/types/query'
  import { convertTimestampToMilliseconds } from '@/utils/date-time'
  import { replaceTimePlaceholders } from '@/utils/sql'
  import dayjs from 'dayjs'
  import { toObj } from './until'

  const props = defineProps<{
    rows: any[]
    columns: ColumnType[]
    queryState: QueryState
  }>()

  const emit = defineEmits(['update:rows'])

  const leftDisabled = ref(false)
  const rightDisabled = ref(false)
  type PageRange = {
    label?: string
    start?: number
    end?: number
    loading?: boolean
  }
  const pages = ref<Array<PageRange>>([])
  const currPage = ref<PageRange>()
  const newerLoading = ref(false)
  const olderLoading = ref(false)

  function queryPage(pageSql: string, reverse = false) {
    return editorAPI.runSQL(pageSql).then((result) => {
      const rowsTmp = result.output[0].records.rows
      const queryColumns = result.output[0].records.schema.column_schemas
      const arr = []
      if (reverse) {
        for (let i = rowsTmp.length - 1; i >= 0; i -= 1) {
          arr.push(toObj(rowsTmp[i], queryColumns, i, props.queryState.tsColumn))
        }
      } else {
        for (let i = 0; i < rowsTmp.length; i += 1) {
          arr.push(toObj(rowsTmp[i], queryColumns, i, props.queryState.tsColumn))
        }
      }
      emit('update:rows', arr)
    })
  }

  function formatDate(value: number, dataType: string) {
    const ms = convertTimestampToMilliseconds(value, dataType)
    return dayjs(ms).format('HH:mm:ss')
  }

  function addPage(direction = 'right') {
    const order = props.queryState.orderBy

    if (!props.rows.length || !props.queryState.tsColumn) {
      currPage.value = {}
      return
    }
    const tsName = props.queryState.tsColumn?.name as string
    const first = order === 'ASC' ? props.rows[0] : props.rows[props.rows.length - 1]
    const last = order === 'ASC' ? props.rows[props.rows.length - 1] : props.rows[0]

    const startLabel = formatDate(first[tsName], props.queryState.tsColumn?.data_type)
    const endLabel = formatDate(last[tsName], props.queryState.tsColumn?.data_type)
    const pageTmp = {
      label: `${startLabel}—${endLabel}`,
      start: first[tsName],
      end: last[tsName],
    }
    currPage.value = pageTmp
    if (!pages.value.filter((page) => page.start === pageTmp.start && page.end === pageTmp.end).length) {
      if (direction === 'right') {
        pages.value.push(pageTmp)
      } else {
        pages.value.unshift(pageTmp)
      }
    }
  }

  function loadPage(start, end, pageIndex: number) {
    if (!props.queryState.tsColumn) return
    pages.value[pageIndex].loading = true
    const sql = props.queryState.generateSql(props.queryState.sourceState, [start, end])
    const pageSql = replaceTimePlaceholders(sql, [start, Number(end) + 1])
    queryPage(pageSql)
      .then(() => {
        const index = pages.value.findIndex((page) => page.start === start && page.end === end)
        currPage.value = pages.value[index]
      })
      .finally(() => {
        pages.value[pageIndex].loading = false
      })
  }

  function loadOlder() {
    if (!props.queryState.tsColumn) {
      return
    }
    olderLoading.value = true
    const end = pages.value[0].start

    // Use the start from timeRangeValues directly
    const [startValue] = props.queryState.timeRangeValues
    const sql = props.queryState.generateSql({ ...props.queryState.sourceState, orderBy: 'DESC' }, [startValue, end])

    const pageSql = replaceTimePlaceholders(sql, [startValue, end])
    const order = props.queryState.orderBy
    const reverse = order === 'ASC'
    queryPage(pageSql, reverse)
      .then(() => {
        addPage('left')
        if (props.rows.length < props.queryState.limit) {
          leftDisabled.value = true
        }
      })
      .finally(() => {
        olderLoading.value = false
      })
  }

  function loadNewer() {
    if (!props.queryState.tsColumn) {
      return
    }
    newerLoading.value = true
    const start = pages.value[pages.value.length - 1].end

    // Use the end from timeRangeValues directly
    const [, endValue] = props.queryState.timeRangeValues
    const sql = props.queryState.generateSql({ ...props.queryState.sourceState, orderBy: 'ASC' }, [start, endValue])
    const pageSql = replaceTimePlaceholders(sql, [start, endValue])
    const order = props.queryState.orderBy
    const reverse = order === 'DESC'
    queryPage(pageSql, reverse)
      .then(() => {
        addPage('right')
        if (props.rows.length < props.queryState.limit) {
          rightDisabled.value = true
        }
      })
      .finally(() => {
        newerLoading.value = false
      })
  }

  // add page after click uncheck live
  if (props.rows && props.rows.length > 0) {
    addPage()
  }
</script>

<style scoped lang="less">
  .btn {
    color: var(--color-text-2);
    transition: all 0.2s ease;
    &:hover:not(:disabled) {
      color: var(--brand-color);
      background-color: var(--color-fill-2);
    }
  }
  .btn.active {
    color: var(--brand-color);
    background-color: var(--color-primary-light-1);
    font-weight: 500;
    &:hover {
      background-color: var(--color-primary-light-2);
    }
  }
  .btn-hint {
    color: var(--color-text-3);
    cursor: help;
    transition: color 0.2s ease;
    &:hover {
      color: var(--brand-color);
    }
  }

  // 时间段按钮组容器样式优化
  :deep(.arco-space) {
    gap: 4px;
  }

  // 时间段按钮样式优化
  :deep(.arco-btn-text) {
    padding: 4px 8px;
    border-radius: 4px;
    font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
    font-size: 12px;
    min-height: 24px;
    line-height: 1.4;
  }

  // Older/Newer 按钮样式
  :deep(.arco-btn-size-small) {
    padding: 4px 8px;
    min-height: 24px;
  }
</style>
