<template lang="pug">
a-space(v-if="pages.length")
  a-button.btn(size="small" :loading="olderLoading" @click="loadOlder")
    icon-left
    | {{ $t('logquery.older') }}
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
    | {{ $t('logquery.newer') }}
    icon-right
</template>

<script setup name="Pagination" lang="ts">
  import { watchOnce } from '@vueuse/core'
  import editorAPI from '@/api/editor'
  import useLogQueryStore from '@/store/modules/logquery'
  import type { SchemaType } from '@/store/modules/code-run/types'
  import { addTsCondition, TimeTypes, toDateStr, toObj } from './until'
  import type { TimeType } from './until'

  const { columns, rows, currRow, selectedRowKey, queryNum, sql, tsColumn, unifiedRange, limit } = storeToRefs(
    useLogQueryStore()
  )
  const { getRelativeRange, getColumnByName } = useLogQueryStore()

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
    const orderRe = new RegExp(`ORDER BY ${tsColumn.value.name}\\s+(DESC|ASC)`, 'i')
    const result = orderRe.exec(sql.value)
    if (result) {
      return result[1] as Order
    }
    return 'DESC'
  }

  function replaceOrder(sqlStr: string, from: Order, to: Order) {
    const orderRe = new RegExp(`(ORDER BY ${tsColumn.value.name})\\s+(${from})`, 'i')
    return sqlStr.replace(orderRe, `$1 ${to}`)
  }

  function queryPage(pageSql: string, reverse = false) {
    return editorAPI.runSQL(pageSql).then((result) => {
      const rowsTmp = result.output[0].records.rows
      const queryColumns = result.output[0].records.schema.column_schemas
      const arr = []
      if (reverse) {
        for (let i = rowsTmp.length - 1; i >= 0; i -= 1) {
          arr.push(toObj(rowsTmp[i], queryColumns, i, tsColumn.value))
        }
      } else {
        for (let i = 0; i < rowsTmp.length; i += 1) {
          arr.push(toObj(rowsTmp[i], queryColumns, i, tsColumn.value))
        }
      }
      rows.value = arr
    })
  }

  function addPage(direction = 'right') {
    const order = getOrder()
    if (!rows.value.length || !tsColumn.value) {
      currPage.value = {}
      return
    }
    const tsName = tsColumn.value?.name as string
    const first = order === 'ASC' ? rows.value[0] : rows.value[rows.value.length - 1]
    const last = order === 'ASC' ? rows.value[rows.value.length - 1] : rows.value[0]

    // const { data_type: dataType } = getColumnByName(tsName) as TimeType
    const startLabel = toDateStr(first[tsName], tsColumn.value?.multiple, 'HH:mm:ss')
    const endLabel = toDateStr(last[tsName], tsColumn.value?.multiple, 'HH:mm:ss')
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

  function loadPage(start: number, end: number, pageIndex: number) {
    pages.value[pageIndex].loading = true
    const tsName = tsColumn.value?.name as string
    const pageSql = addTsCondition(sql.value, tsName, start, end + 1)
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
    if (!tsColumn.value) {
      return
    }
    olderLoading.value = true
    const end = pages.value[0].start
    const { multiple } = tsColumn.value
    const [start] = getRelativeRange(multiple)
    let pageSql = addTsCondition(sql.value, tsColumn.value.name, start, end)
    // pageSql = pageSql.replace('ASC', 'DESC')
    pageSql = replaceOrder(pageSql, 'ASC', 'DESC')
    const order = getOrder()
    const reverse = order === 'ASC'
    queryPage(pageSql, reverse)
      .then(() => {
        addPage('left')
        if (rows.value.length < limit.value) {
          leftDisabled.value = true
        }
      })
      .finally(() => {
        olderLoading.value = false
      })
  }

  function loadNewer() {
    if (!tsColumn.value) {
      return
    }
    newerLoading.value = true
    const start = pages.value[pages.value.length - 1].end
    const { multiple } = tsColumn.value
    const [, end] = getRelativeRange(multiple)
    let pageSql = addTsCondition(sql.value, tsColumn.value.name, start, end)
    // pageSql = pageSql.replace('DESC', 'ASC')
    pageSql = replaceOrder(pageSql, 'DESC', 'ASC')
    const order = getOrder()
    const reverse = order === 'DESC'
    queryPage(pageSql, reverse)
      .then(() => {
        addPage('right')
        if (rows.value.length < limit.value) {
          rightDisabled.value = true
        }
      })
      .finally(() => {
        newerLoading.value = false
      })
  }

  // add page when click run
  watchOnce(rows, () => {
    nextTick(() => {
      if (rows.value && rows.value.length) {
        pages.value = []
        addPage()
      }
    })
  })

  // add page after click uncheck live
  if (rows.value && rows.value.length > 0) {
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
