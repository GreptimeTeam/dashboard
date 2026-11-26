import { computed, ref, watch, type Ref } from 'vue'
import type { TableData } from '../types'

export type PaginationOptions = {
  pageSize?: number
  pageSizeOptions?: number[]
  placement?: 'bottom' | 'none'
  simple?: boolean
}

const DEFAULT_PAGE_SIZE = 20
const DEFAULT_PAGE_SIZE_OPTIONS = [10, 20, 50, 100]

/**
 * Client-side pagination for DataGrid. Rows keep a full-dataset `__rowIndex`
 * so active-row highlighting and detail drawers can cross pages.
 */
export default function usePagination(options: {
  enabled: Ref<boolean> | (() => boolean)
  data: () => TableData[]
  pageSize?: Ref<number> | (() => number)
  activeRowKey?: Ref<number | null | undefined> | (() => number | null | undefined)
}) {
  const enabled = typeof options.enabled === 'function' ? options.enabled : () => options.enabled.value
  const pageSizeOpt =
    typeof options.pageSize === 'function' ? options.pageSize : () => options.pageSize?.value ?? DEFAULT_PAGE_SIZE
  const activeRowKey =
    typeof options.activeRowKey === 'function' ? options.activeRowKey : () => options.activeRowKey?.value ?? null

  const currentPage = ref(1)
  const pageSize = ref(DEFAULT_PAGE_SIZE)

  watch(
    pageSizeOpt,
    (size) => {
      if (size > 0 && size !== pageSize.value) {
        pageSize.value = size
      }
    },
    { immediate: true }
  )

  const totalRows = computed(() => options.data().length)

  const pagedData = computed(() => {
    const rows = options.data()
    if (!enabled()) {
      return rows.map((row, index) => ({
        ...row,
        __rowIndex: typeof row.__rowIndex === 'number' ? row.__rowIndex : index,
      }))
    }
    const start = (currentPage.value - 1) * pageSize.value
    return rows.slice(start, start + pageSize.value).map((row, index) => ({
      ...row,
      __rowIndex: start + index,
    }))
  })

  function syncPageToActiveRow(key: number | null | undefined) {
    if (!enabled() || key == null || key < 0 || totalRows.value === 0) {
      return
    }
    const targetPage = Math.floor(key / pageSize.value) + 1
    const maxPage = Math.max(1, Math.ceil(totalRows.value / pageSize.value))
    if (targetPage >= 1 && targetPage <= maxPage && targetPage !== currentPage.value) {
      currentPage.value = targetPage
    }
  }

  function setPage(page: number) {
    currentPage.value = page
  }

  function setPageSize(size: number) {
    pageSize.value = size
    currentPage.value = 1
  }

  watch(
    () => options.data(),
    () => {
      currentPage.value = 1
    }
  )

  watch(
    () => activeRowKey(),
    (key) => {
      syncPageToActiveRow(key)
    }
  )

  watch(pageSize, () => {
    syncPageToActiveRow(activeRowKey())
  })

  return {
    currentPage,
    pageSize,
    totalRows,
    pagedData,
    setPage,
    setPageSize,
    pageSizeOptions: DEFAULT_PAGE_SIZE_OPTIONS,
  }
}

export { DEFAULT_PAGE_SIZE, DEFAULT_PAGE_SIZE_OPTIONS }
