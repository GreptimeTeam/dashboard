import { computed, nextTick, ref, type Ref } from 'vue'
import type { TableData } from '../types'

/** Distance from the bottom where the footer hint shows up (Grafana behavior). */
const NEAR_END_PX = 120
/** Distance from the bottom that auto-loads the next page. */
const AUTO_LOAD_PX = 8
/** Scrolling this far back up re-arms the auto-load for the next bottom hit. */
const REARM_PX = 120
/**
 * Auto-load only counts as deliberate when a wheel/touch gesture drove the
 * scroll into the end zone. Dragging the scrollbar across the last stretch does
 * not trigger a fetch (Grafana keeps that last bit non-committing) — the footer
 * is there to click instead.
 */
const SCROLL_INTENT_MS = 400

/**
 * Load-more state machine for the logs table footer:
 * armed → near-end → deliberate scroll bottom → request (once) → re-arm.
 */
export default function useLogsLoadMore(options: {
  rootEl: Ref<HTMLElement | null>
  rowHeight: () => number
  hasMore: () => boolean
  loadingMore: () => boolean
  wrapLine: () => boolean
  data: () => TableData[]
  /** Emit reachEnd to the parent (parents own the "is there more" decision). */
  request: () => void
  /** Close transient popups when the user scrolls. */
  onScrollActivity: () => void
}) {
  const { rootEl, request, onScrollActivity } = options

  let reachEndArmed = true
  /** True while the viewport sits at the end of the loaded rows. */
  const nearEnd = ref(false)
  /** VXE horizontal scrollbar height — keeps the footer from covering it. */
  const scrollXOffset = ref(0)
  /** Last wheel offset reported by VXE (virtual scrolling keeps it internally). */
  let lastScrollTop = 0
  let lastScrollIntentAt = 0

  function markScrollIntent() {
    lastScrollIntentAt = Date.now()
  }

  const showLoadMoreBar = computed(() => options.hasMore() && (options.loadingMore() || nearEnd.value))

  function syncScrollXOffset() {
    const el = rootEl.value?.querySelector('.vxe-table--scroll-x-virtual') as HTMLElement | null
    scrollXOffset.value = el ? el.offsetHeight : 0
  }

  /** Total content height in px (fixed row height, or averaged when wrapping). */
  function estimateContentHeight(): number {
    const data = options.data()
    if (!options.wrapLine() || !data.length) {
      return data.length * options.rowHeight()
    }
    const rowEls = rootEl.value?.querySelectorAll('.vxe-body--row')
    if (!rowEls?.length) {
      return data.length * options.rowHeight()
    }
    let total = 0
    rowEls.forEach((el) => {
      total += (el as HTMLElement).offsetHeight
    })
    return (total / rowEls.length) * data.length
  }

  function requestLoadMore() {
    // Parents own the "is there more" decision; only avoid stacking requests.
    if (options.loadingMore()) {
      return
    }
    reachEndArmed = false
    request()
  }

  function onScroll(params: { isY?: boolean; scrollTop?: number; scrollHeight?: number; bodyHeight?: number }) {
    onScrollActivity()
    const { isY, scrollTop, scrollHeight, bodyHeight } = params
    if (!isY || scrollTop == null || scrollHeight == null || bodyHeight == null) {
      return
    }
    const remaining = scrollHeight - scrollTop - bodyHeight
    lastScrollTop = scrollTop
    nearEnd.value = remaining <= NEAR_END_PX
    if (remaining <= AUTO_LOAD_PX) {
      syncScrollXOffset()
      const deliberate = Date.now() - lastScrollIntentAt <= SCROLL_INTENT_MS
      if (reachEndArmed && deliberate) {
        requestLoadMore()
      }
    } else if (remaining > REARM_PX) {
      reachEndArmed = true
    }
  }

  /**
   * Recompute the end state from real geometry. A page that does not fill the
   * viewport has nothing to scroll, so the footer shows up right away and the user
   * clicks it to continue. Auto-loading stays tied to real scroll events, which
   * keeps repeated appends from feeding themselves.
   */
  function checkViewportFilled() {
    nextTick(() => {
      if (!options.hasMore()) {
        nearEnd.value = false
        return
      }
      const bodyEl = rootEl.value?.querySelector('.vxe-table--body-wrapper') as HTMLElement | null
      if (!bodyEl) {
        return
      }
      syncScrollXOffset()
      // VXE virtual scrolling keeps the wheel offset internally, so the wrapper's
      // scrollHeight stays at the viewport height — estimate the content height.
      const remaining = estimateContentHeight() - lastScrollTop - bodyEl.clientHeight
      nearEnd.value = remaining <= NEAR_END_PX
    })
  }

  return {
    nearEnd,
    scrollXOffset,
    showLoadMoreBar,
    markScrollIntent,
    onScroll,
    requestLoadMore,
    checkViewportFilled,
    syncScrollXOffset,
  }
}
