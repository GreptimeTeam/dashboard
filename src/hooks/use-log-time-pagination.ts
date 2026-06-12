import {
  resolveNewerPageRange,
  resolveOlderPageRange,
  resolveReplayPageRange,
  type LogTimeBound,
  type LogTimePaginationIntent,
  type LogTimeRange,
} from '@/utils/log-time-pagination'
import { computed, ref, watch, unref, type MaybeRef, type Ref, type WatchSource } from 'vue'

export type LogTimePageRange = {
  label?: string
  start?: LogTimeBound
  end?: LogTimeBound
  loading?: boolean
}

export type LogTimePaginationOrder = 'ASC' | 'DESC'

export type LogTimePageBounds = {
  start: LogTimeBound
  end: LogTimeBound
  label: string
}

export type LogTimeFetchMeta = {
  /** Chronologically oldest row on the target pill (leftmost for Older). */
  oldestOnPage?: LogTimeBound
  /** Chronologically newest row on the target pill (rightmost for Newer). */
  newestOnPage?: LogTimeBound
}

export interface LogTimePaginationHandlers<TRow> {
  getPageBounds: (rows: TRow[], order: LogTimePaginationOrder) => LogTimePageBounds | null
  /** Prefer row scan over pill bounds when resolving Older/Newer cursors. */
  getChronologicalBound?: (rows: TRow[], pick: 'oldest' | 'newest') => LogTimeBound | undefined
  fetchRange: (
    range: LogTimeRange,
    intent: LogTimePaginationIntent,
    order: LogTimePaginationOrder,
    meta?: LogTimeFetchMeta
  ) => Promise<TRow[]>
}

export interface UseLogTimePaginationOptions<TRow> {
  rows: Ref<TRow[]>
  limit: MaybeRef<number>
  order: MaybeRef<LogTimePaginationOrder>
  globalRange: MaybeRef<LogTimeRange | null>
  toMs: (value: LogTimeBound) => number
  canLoadOlder?: (global: LogTimeRange, oldestBound: LogTimeBound) => boolean
  canLoadNewer?: (global: LogTimeRange, newestBound: LogTimeBound) => boolean
  handlers: LogTimePaginationHandlers<TRow>
  onUpdateRows: (rows: TRow[]) => void
  resetOn?: WatchSource | WatchSource[]
}

export function useLogTimePagination<TRow>(options: UseLogTimePaginationOptions<TRow>) {
  const pages = ref<LogTimePageRange[]>([])
  const currPage = ref<LogTimePageRange>({})
  const newerLoading = ref(false)
  const olderLoading = ref(false)
  const leftDisabled = ref(false)
  const rightDisabled = ref(false)

  function boundByChronology(page: LogTimePageRange, pick: 'oldest' | 'newest'): LogTimeBound {
    const a = page.start as LogTimeBound
    const b = page.end as LogTimeBound
    const aMs = options.toMs(a)
    const bMs = options.toMs(b)
    if (!Number.isFinite(aMs) || !Number.isFinite(bMs)) {
      return a
    }
    if (pick === 'oldest') {
      return aMs <= bMs ? a : b
    }
    return aMs >= bMs ? a : b
  }

  function addPageFromRows(pageRows: TRow[], direction: 'left' | 'right') {
    const bounds = options.handlers.getPageBounds(pageRows, unref(options.order))
    if (!bounds) {
      currPage.value = {}
      return
    }

    const pageTmp: LogTimePageRange = {
      label: bounds.label,
      start: bounds.start,
      end: bounds.end,
    }

    currPage.value = pageTmp
    if (!pages.value.some((page) => page.start === pageTmp.start && page.end === pageTmp.end)) {
      if (direction === 'right') {
        pages.value.push(pageTmp)
      } else {
        pages.value.unshift(pageTmp)
      }
    }
  }

  async function loadPage(start: LogTimeBound, end: LogTimeBound, pageIndex: number) {
    pages.value[pageIndex].loading = true
    try {
      const range = resolveReplayPageRange(start, end)
      const rows = await options.handlers.fetchRange(range, 'replay', unref(options.order))
      options.onUpdateRows(rows)
      const index = pages.value.findIndex((item) => item.start === start && item.end === end)
      if (index >= 0) {
        currPage.value = pages.value[index]
      }
    } finally {
      pages.value[pageIndex].loading = false
    }
  }

  async function loadOlder() {
    if (!pages.value.length) return

    const global = unref(options.globalRange)
    if (!global) {
      leftDisabled.value = true
      return
    }

    olderLoading.value = true
    const leftmostPage = pages.value[0]
    const pageRows = unref(options.rows)
    const oldestBound =
      (pageRows.length ? options.handlers.getChronologicalBound?.(pageRows, 'oldest') : undefined) ??
      boundByChronology(leftmostPage, 'oldest')
    const older = resolveOlderPageRange(global, oldestBound, options.toMs)
    const valid = older.valid && (options.canLoadOlder ? options.canLoadOlder(global, oldestBound) : true)
    if (!valid) {
      leftDisabled.value = true
      olderLoading.value = false
      return
    }

    try {
      const rows = await options.handlers.fetchRange(older.range, 'older', unref(options.order), {
        oldestOnPage: oldestBound,
      })
      if (!rows.length) {
        leftDisabled.value = true
        return
      }
      options.onUpdateRows(rows)
      addPageFromRows(rows, 'left')
      if (rows.length < unref(options.limit)) {
        leftDisabled.value = true
      }
    } finally {
      olderLoading.value = false
    }
  }

  async function loadNewer() {
    if (!pages.value.length) return

    const global = unref(options.globalRange)
    if (!global) {
      rightDisabled.value = true
      return
    }

    newerLoading.value = true
    const rightmostPage = pages.value[pages.value.length - 1]
    const pageRows = unref(options.rows)
    const newestBound =
      (pageRows.length ? options.handlers.getChronologicalBound?.(pageRows, 'newest') : undefined) ??
      boundByChronology(rightmostPage, 'newest')
    const newer = resolveNewerPageRange(global, newestBound, options.toMs)
    const valid = newer.valid && (options.canLoadNewer ? options.canLoadNewer(global, newestBound) : true)
    if (!valid) {
      rightDisabled.value = true
      newerLoading.value = false
      return
    }

    try {
      const rows = await options.handlers.fetchRange(newer.range, 'newer', unref(options.order), {
        newestOnPage: newestBound,
      })
      if (!rows.length) {
        rightDisabled.value = true
        return
      }
      options.onUpdateRows(rows)
      addPageFromRows(rows, 'right')
      if (rows.length < unref(options.limit)) {
        rightDisabled.value = true
      }
    } finally {
      newerLoading.value = false
    }
  }

  const currPageIndex = computed(() =>
    pages.value.findIndex((page) => page.start === currPage.value.start && page.end === currPage.value.end)
  )

  function selectPage(index: number) {
    const page = pages.value[index]
    if (!page || page.start === undefined || page.end === undefined) {
      return
    }
    loadPage(page.start, page.end, index)
  }

  function resetPages() {
    pages.value = []
    currPage.value = {}
    leftDisabled.value = false
    rightDisabled.value = false
  }

  watch(
    options.rows,
    (rows) => {
      if (rows.length > 0 && pages.value.length === 0) {
        addPageFromRows(rows, 'right')
      }
    },
    { immediate: true }
  )

  if (options.resetOn) {
    watch(options.resetOn, () => {
      resetPages()
    })
  }

  return {
    pages,
    currPage,
    currPageIndex,
    newerLoading,
    olderLoading,
    leftDisabled,
    rightDisabled,
    loadPage,
    selectPage,
    loadOlder,
    loadNewer,
    resetPages,
  }
}
