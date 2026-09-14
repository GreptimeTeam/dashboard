/**
 * Shared URL ↔ panel-tab sync for Drilldown (metrics `tab`, logs `logsTab`, traces `tracesTab`).
 * Default tab is omitted from the query to keep links short.
 */

export interface DrilldownUrlTabSpec<T extends string = string> {
  /** Query param name. */
  queryKey: string
  defaultTab: T
  isTab: (value: unknown) => value is T
  get: () => T
  set: (tab: T) => void
  /**
   * When false, skip writing this param and reset to default on read
   * (e.g. metrics `tab` only while a metric is open).
   */
  active?: () => boolean
}

/** Apply one tab param from `route.query` into Context. */
export function readUrlTab(spec: DrilldownUrlTabSpec, raw: unknown): void {
  if (spec.active && !spec.active()) {
    if (spec.get() !== spec.defaultTab) {
      spec.set(spec.defaultTab)
    }
    return
  }
  if (spec.isTab(raw)) {
    spec.set(raw)
    return
  }
  if (spec.get() !== spec.defaultTab) {
    spec.set(spec.defaultTab)
  }
}

/** Write one tab into the outgoing query object (omit default). */
export function writeUrlTab(query: Record<string, string | string[]>, spec: DrilldownUrlTabSpec): void {
  if (spec.active && !spec.active()) {
    return
  }
  if (spec.get() !== spec.defaultTab) {
    query[spec.queryKey] = spec.get()
  }
}

/** Snapshot values for a watch source list. */
export function urlTabWatchSources(specs: DrilldownUrlTabSpec[]): unknown[] {
  return specs.map((spec) => spec.get())
}
