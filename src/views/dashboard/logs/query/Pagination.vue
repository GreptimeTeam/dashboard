<template lang="pug">
a-space(v-if="pages.length")
  a-button.btn(size="small" :loading="olderLoading" @click="loadOlder")
    icon-left
    | {{ $t('logsQuery.older') }}
  a-space(style="overflow-x: auto; max-width: 55vw")
    a-button.btn(
      v-for="(page, index) in pages"
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
</template>

<script setup name="Pagination" lang="ts">
  import { ref, nextTick } from 'vue'
  import { watchOnce } from '@vueuse/core'
  import { storeToRefs } from 'pinia'
  import editorAPI from '@/api/editor'
  import useLogsQueryStore from '@/store/modules/logs-query'
  import type { SchemaType } from '@/store/modules/code-run/types'
  import { addTsCondition, TimeTypes, toDateStr, toObj } from './until'
  import type { TimeType } from './until'
  import type { ColumnType, TSColumn } from './types'

  const props = defineProps<{
    rows: any[]
    columns: ColumnType[]
    sql: string
    tsColumn: TSColumn | null
    limit: number
  }>()

  const emit = defineEmits(['update:rows'])

  const { queryNum, timeRangeValues } = storeToRefs(useLogsQueryStore())

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

  type Order = 'ASC' | 'DESC'

  function getOrder(): Order {
    if (!props.tsColumn) return 'DESC'
    const orderRe = new RegExp(`ORDER BY ${props.tsColumn.name}\\s+(DESC|ASC)`, 'i')
    const result = orderRe.exec(props.sql)
    if (result) {
      return result[1] as Order
    }
    return 'DESC'
  }

  function replaceOrder(sqlStr: string, from: Order, to: Order) {
    if (!props.tsColumn) return sqlStr
    const orderRe = new RegExp(`(ORDER BY ${props.tsColumn.name})\\s+(${from})`, 'i')
    return sqlStr.replace(orderRe, `$1 ${to}`)
  }

  function queryPage(pageSql: string, reverse = false) {
    return editorAPI.runSQL(pageSql).then((result) => {
      const rowsTmp = result.output[0].records.rows
      const queryColumns = result.output[0].records.schema.column_schemas
      const arr = []
      if (reverse) {
        for (let i = rowsTmp.length - 1; i >= 0; i -= 1) {
          arr.push(toObj(rowsTmp[i], queryColumns, i, props.tsColumn))
        }
      } else {
        for (let i = 0; i < rowsTmp.length; i += 1) {
          arr.push(toObj(rowsTmp[i], queryColumns, i, props.tsColumn))
        }
      }
      emit('update:rows', arr)
    })
  }

  function addPage(direction = 'right') {
    const order = getOrder()
    if (!props.rows.length || !props.tsColumn) {
      currPage.value = {}
      return
    }
    const tsName = props.tsColumn?.name as string
    const first = order === 'ASC' ? props.rows[0] : props.rows[props.rows.length - 1]
    const last = order === 'ASC' ? props.rows[props.rows.length - 1] : props.rows[0]

    const startLabel = toDateStr(first[tsName], props.tsColumn?.multiple, 'HH:mm:ss')
    const endLabel = toDateStr(last[tsName], props.tsColumn?.multiple, 'HH:mm:ss')
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

  // Helper function to replace time placeholders in SQL
  function replaceTimePlaceholders(sql: string, start: any, end: any) {
    return sql.replace(/\$timestart/g, start.toString()).replace(/\$timeend/g, end.toString())
  }

  function loadPage(start: number, end: number, pageIndex: number) {
    if (!props.tsColumn) return
    pages.value[pageIndex].loading = true

    const pageSql = replaceTimePlaceholders(props.sql, start, Number(end) + 1)
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
    if (!props.tsColumn || !timeRangeValues.value.length) {
      return
    }
    olderLoading.value = true
    const end = pages.value[0].start

    // Use the start from timeRangeValues directly
    const [startValue] = timeRangeValues.value

    let pageSql = replaceTimePlaceholders(props.sql, startValue, end)
    pageSql = replaceOrder(pageSql, 'ASC', 'DESC')
    const order = getOrder()
    const reverse = order === 'ASC'
    queryPage(pageSql, reverse)
      .then(() => {
        addPage('left')
        if (props.rows.length < props.limit) {
          leftDisabled.value = true
        }
      })
      .finally(() => {
        olderLoading.value = false
      })
  }

  function loadNewer() {
    if (!props.tsColumn || !timeRangeValues.value.length) {
      return
    }
    newerLoading.value = true
    const start = pages.value[pages.value.length - 1].end

    // Use the end from timeRangeValues directly
    const [, endValue] = timeRangeValues.value

    let pageSql = replaceTimePlaceholders(props.sql, start, endValue)
    pageSql = replaceOrder(pageSql, 'DESC', 'ASC')
    const order = getOrder()
    const reverse = order === 'DESC'
    queryPage(pageSql, reverse)
      .then(() => {
        addPage('right')
        if (props.rows.length < props.limit) {
          rightDisabled.value = true
        }
      })
      .finally(() => {
        newerLoading.value = false
      })
  }

  // add page when rows change
  watchOnce(
    () => props.rows,
    () => {
      nextTick(() => {
        if (props.rows && props.rows.length) {
          pages.value = []
          addPage()
        }
      })
    }
  )

  // add page after click uncheck live
  if (props.rows && props.rows.length > 0) {
    addPage()
  }
</script>

<style scoped lang="less">
  .btn {
    color: var(--color-text-2);
  }
  .btn.active {
    color: var(--brand-color);
  }
</style>
