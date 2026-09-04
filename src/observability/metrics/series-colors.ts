/**
 * Grafana metrics-drilldown timeseries colors.
 *
 * @see metrics-drilldown `getColorByIndex` → `visTheme.palette[index % 8]`
 * @see grafana-data `getClassicPalette` + dark/light viz hues
 */

/** First 8 classic palette names resolved for dark theme. */
export const GRAFANA_SERIES_PALETTE_DARK = [
  '#73BF69', // green
  '#F2CC0C', // semi-dark-yellow
  '#5794F2', // blue
  '#FF9830', // orange
  '#F2495C', // red
  '#B877D9', // purple
  '#37872D', // dark-green
  '#E0B400', // dark-yellow
] as const

/** First 8 classic palette names resolved for light theme. */
export const GRAFANA_SERIES_PALETTE_LIGHT = [
  '#56A64B', // green
  '#E0B400', // semi-dark-yellow
  '#3274D9', // blue
  '#FF780A', // orange
  '#E02F44', // red
  '#A352CC', // purple
  '#19730E', // dark-green
  '#CC9D00', // dark-yellow
] as const

/** Grafana timeseries `fillOpacity: 9` → 9% area under the line. */
export const SERIES_FILL_OPACITY = 0.09

/**
 * Color for a catalog / panel timeseries by list index (cycles every 8).
 * Matches metrics-drilldown MetricsList `fixedColorIndex: colorIndex`.
 */
export default function getSeriesColorByIndex(index: number, isDark = false): string {
  const palette = isDark ? GRAFANA_SERIES_PALETTE_DARK : GRAFANA_SERIES_PALETTE_LIGHT
  const safeIndex = Number.isFinite(index) ? Math.abs(Math.floor(index)) : 0
  return palette[safeIndex % palette.length]
}
