/**
 * Click a legend item to show only that series; click it again to show all.
 * Same solo mode as metrics-query (`legendselectchanged` + `legend.selected`).
 */
export function toggleLegendSolo(current: string | null, name: string): string | null {
  return current === name ? null : name
}

/** ECharts `legend.selected`. `undefined` means every series stays visible. */
export function legendSoloSelected(names: string[], solo: string | null): Record<string, boolean> | undefined {
  if (!solo) {
    return undefined
  }
  return Object.fromEntries(names.map((name) => [name, name === solo]))
}
