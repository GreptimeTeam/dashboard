/**
 * Grafana Metrics Drilldown unit inference + display formatting.
 *
 * @see metrics-drilldown `shared/GmdVizPanel/units/getUnit.ts`
 * @see grafana-data valueFormats (cps, Bps, bytes, s, …)
 */

export const DEFAULT_UNIT = 'none'
export const DEFAULT_RATE_UNIT = 'cps'

export const UNIT_BYTES = 'bytes'
export const UNIT_SECONDS = 'seconds'

const UNIT_PERCENT = 'percent'
const UNIT_COUNT = 'count'
const UNIT_HERTZ = 'hertz'
const UNIT_CELSIUS = 'celsius'
const UNIT_VOLTS = 'volts'
const UNIT_AMPERES = 'amperes'
const UNIT_JOULES = 'joules'
const UNIT_WATTS = 'watts'
const UNIT_RATIO = 'ratio'

export const RATE_BYTES_PER_SECOND = 'Bps'

/** Prometheus name suffix → Grafana panel unit id (non-rate). */
const UNIT_MAP: Record<string, string> = {
  [UNIT_BYTES]: UNIT_BYTES,
  [UNIT_SECONDS]: 's',
  [UNIT_PERCENT]: UNIT_PERCENT,
  [UNIT_COUNT]: DEFAULT_UNIT,
  [UNIT_HERTZ]: 'hertz',
  [UNIT_CELSIUS]: 'celsius',
  [UNIT_VOLTS]: 'volt',
  [UNIT_AMPERES]: 'amp',
  [UNIT_JOULES]: 'joule',
  [UNIT_WATTS]: 'watt',
  [UNIT_RATIO]: 'percentunit',
}

const UNIT_LIST = Object.keys(UNIT_MAP)

/** Prometheus name suffix → Grafana panel unit id when the query is a per-second rate. */
const RATE_UNIT_MAP: Record<string, string> = {
  [UNIT_BYTES]: RATE_BYTES_PER_SECOND,
  // seconds per second is unitless
  [UNIT_SECONDS]: DEFAULT_UNIT,
  [UNIT_COUNT]: DEFAULT_RATE_UNIT,
  [UNIT_PERCENT]: UNIT_PERCENT,
  // hertz is already "per second"
  [UNIT_HERTZ]: DEFAULT_UNIT,
  [UNIT_CELSIUS]: DEFAULT_RATE_UNIT,
  [UNIT_VOLTS]: DEFAULT_RATE_UNIT,
  [UNIT_AMPERES]: DEFAULT_RATE_UNIT,
  // joules / s = watts
  [UNIT_JOULES]: 'watt',
  [UNIT_WATTS]: DEFAULT_RATE_UNIT,
  [UNIT_RATIO]: 'percentunit',
}

/** Last 1–2 underscore parts that look like a known unit (skips `_total` etc.). */
export function getUnitFromMetric(metric: string): string | null {
  const metricParts = metric.toLowerCase().split('_').slice(-2)
  for (let i = metricParts.length - 1; i >= Math.max(0, metricParts.length - 2); i -= 1) {
    const part = metricParts[i]
    if (UNIT_LIST.includes(part)) {
      return part
    }
  }
  return null
}

/** Grafana unit for a gauge / avg panel (`go_gc_duration_seconds` → `s`). */
export function getUnit(metricName: string): string {
  const metricPart = getUnitFromMetric(metricName)
  return (metricPart && UNIT_MAP[metricPart.toLowerCase()]) || DEFAULT_UNIT
}

/** Grafana unit for a counter `rate()` panel (`*_bytes_total` → `Bps`, else `cps`). */
export function getPerSecondRateUnit(metricName: string): string {
  const metricPart = getUnitFromMetric(metricName)
  return (metricPart && RATE_UNIT_MAP[metricPart]) || DEFAULT_RATE_UNIT
}

/**
 * Map Greptime / OTLP UCUM `metric.unit` onto Grafana-style panel unit ids.
 * Annotated units (`{request}`) become `ucum:…` for suffix formatting.
 */
export function mapUcumToPanelUnit(ucum: string | null | undefined, isRateQuery: boolean): string | null {
  if (!ucum) {
    return null
  }
  const raw = ucum.trim()
  if (!raw) {
    return null
  }

  if (raw.startsWith('{') && raw.endsWith('}') && raw.length > 2) {
    const label = raw.slice(1, -1)
    return isRateQuery ? `ucum:${label}/s` : `ucum:${label}`
  }

  const lower = raw.toLowerCase()
  switch (lower) {
    case 's':
    case 'sec':
    case 'second':
    case 'seconds':
      return isRateQuery ? DEFAULT_UNIT : 's'
    case 'ms':
    case 'msec':
      return isRateQuery ? DEFAULT_UNIT : 'ms'
    case 'by':
    case 'b':
    case 'byte':
    case 'bytes':
      return isRateQuery ? RATE_BYTES_PER_SECOND : UNIT_BYTES
    case '1':
      // Dimensionless ratio (often 0–1) — Grafana percentunit for gauges.
      return isRateQuery ? DEFAULT_UNIT : 'percentunit'
    case '%':
    case 'percent':
      return 'percent'
    case 'hz':
    case 'hertz':
      return isRateQuery ? DEFAULT_UNIT : 'hertz'
    case 'j':
    case 'joule':
    case 'joules':
      return isRateQuery ? 'watt' : 'joule'
    case 'w':
    case 'watt':
    case 'watts':
      return isRateQuery ? DEFAULT_RATE_UNIT : 'watt'
    case 'v':
    case 'volt':
    case 'volts':
      return isRateQuery ? DEFAULT_RATE_UNIT : 'volt'
    case 'a':
    case 'amp':
    case 'amperes':
      return isRateQuery ? DEFAULT_RATE_UNIT : 'amp'
    case 'cel':
    case 'celsius':
      return isRateQuery ? DEFAULT_RATE_UNIT : 'celsius'
    default:
      // Unknown UCUM — still surface as a suffix rather than dropping it.
      return `ucum:${raw}`
  }
}

/**
 * Timeseries: `isRateQuery ? getPerSecondRateUnit : getUnit`.
 * Heatmap (Grafana): always `getUnit` — cell values still use this panel unit.
 *
 * When `semanticUnit` is a declared UCUM string, it wins over name heuristics.
 */
export function resolveMetricPanelUnit(
  metricName: string,
  isRateQuery: boolean,
  options?: { semanticUnit?: string | null }
): string {
  const fromSemantics = mapUcumToPanelUnit(options?.semanticUnit, isRateQuery)
  if (fromSemantics) {
    return fromSemantics
  }
  return isRateQuery ? getPerSecondRateUnit(metricName) : getUnit(metricName)
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n))
}

function getDecimalsForValue(value: number): number {
  const absValue = Math.abs(value)
  if (absValue === 0) {
    return 0
  }
  const log10 = Math.floor(Math.log(absValue) / Math.LN10)
  let dec = -log10 + 1
  const magn = 10 ** -dec
  const norm = absValue / magn
  if (norm > 2.25) {
    dec += 1
  }
  if (value % 1 === 0) {
    dec = 0
  }
  return Math.max(0, dec)
}

function toFixed(value: number, decimals?: number): string {
  if (!Number.isFinite(value)) {
    return String(value)
  }
  const d = decimals === undefined || decimals === null ? getDecimalsForValue(value) : decimals
  if (value === 0) {
    return '0'
  }
  const factor = d ? 10 ** Math.max(0, d) : 1
  let formatted = String(Math.round(value * factor) / factor)
  if (formatted.includes('e')) {
    return formatted
  }
  const decimalPos = formatted.indexOf('.')
  const precision = decimalPos === -1 ? 0 : formatted.length - decimalPos - 1
  if (precision < d) {
    formatted = (precision ? formatted : `${formatted}.`) + String(factor).slice(1, d - precision + 1)
  }
  // Axis/tooltips: drop trailing zeros from Grafana's padded toFixed (0.300 → 0.3).
  if (formatted.includes('.')) {
    formatted = formatted.replace(/\.?0+$/, '')
  }
  return formatted
}

function logb(base: number, x: number): number {
  return Math.log10(x) / Math.log10(base)
}

function scaledUnits(factor: number, extArray: string[], offset = 0) {
  return (size: number, decimals?: number): { text: string; suffix: string } => {
    if (!Number.isFinite(size)) {
      return { text: String(size), suffix: '' }
    }
    const siIndex = size === 0 ? 0 : Math.floor(logb(factor, Math.abs(size)))
    const suffix = extArray[clamp(offset + siIndex, 0, extArray.length - 1)] ?? ''
    const divisor = factor ** clamp(siIndex, -offset, extArray.length - offset - 1)
    return {
      text: toFixed(size / divisor, decimals),
      suffix,
    }
  }
}

const SI_PREFIXES = ['f', 'p', 'n', 'µ', 'm', '', 'k', 'M', 'G', 'T', 'P', 'E']
const SI_BASE_INDEX = SI_PREFIXES.indexOf('')
const BIN_PREFIXES = ['', 'Ki', 'Mi', 'Gi', 'Ti', 'Pi', 'Ei']

function formatScaled(value: number, factor: number, suffixes: string[], offset = 0): string {
  const { text, suffix } = scaledUnits(factor, suffixes, offset)(value)
  return `${text}${suffix}`
}

function formatSimpleCount(value: number, symbol: string): string {
  const { text, suffix } = scaledUnits(1000, ['', 'K', 'M', 'B', 'T'])(value)
  return `${text}${suffix} ${symbol}`
}

function formatFixedUnit(value: number, unit: string): string {
  return `${toFixed(value)} ${unit}`
}

/** Grafana `s` duration axis/tooltip formatting. */
function formatSeconds(size: number): string {
  if (size === 0) {
    return '0 s'
  }
  const abs = Math.abs(size)
  if (abs < 1e-6) {
    return `${toFixed(size * 1e9)} ns`
  }
  if (abs < 1e-3) {
    return `${toFixed(size * 1e6)} µs`
  }
  if (abs < 1) {
    return `${toFixed(size * 1e3)} ms`
  }
  if (abs < 60) {
    return `${toFixed(size)} s`
  }
  if (abs < 3600) {
    return `${toFixed(size / 60)} min`
  }
  if (abs < 86400) {
    return `${toFixed(size / 3600)} hour`
  }
  return `${toFixed(size / 86400)} day`
}

function formatPercentUnit(value: number): string {
  return `${toFixed(value * 100)}%`
}

function formatPercent(value: number): string {
  return `${toFixed(value)}%`
}

function trimCompactSuffix(label: string): string {
  return label.replace(/(\.\d*?)0+([kM])$/, '$1$2').replace(/\.([kM])$/, '$1')
}

/** Compact unitless number (Grafana `short`/`none`-like). */
function formatNone(value: number): string {
  const abs = Math.abs(value)
  if (abs === 0) {
    return '0'
  }
  if (abs >= 1_000_000) {
    return trimCompactSuffix(`${(value / 1_000_000).toPrecision(3)}M`)
  }
  if (abs >= 1_000) {
    return trimCompactSuffix(`${(value / 1_000).toPrecision(3)}k`)
  }
  if (abs >= 1) {
    if (Number.isInteger(value)) {
      return String(value)
    }
    return String(Number(value.toPrecision(4)))
  }
  if (abs >= 1e-3) {
    return String(Number(value.toPrecision(3)))
  }
  return value.toExponential(2)
}

/**
 * Format a numeric sample with a Grafana unit id (`cps`, `Bps`, `bytes`, `s`, `none`, …).
 * Axis ticks and tooltips share the same formatter (Grafana field unit).
 */
export function formatMetricUnitValue(value: number, unit: string): string {
  if (!Number.isFinite(value)) {
    return '—'
  }

  if (unit.startsWith('ucum:')) {
    const label = unit.slice('ucum:'.length) || 'units'
    return `${formatNone(value)} ${label}`
  }

  switch (unit) {
    case 'cps':
      return formatSimpleCount(value, 'c/s')
    case 'Bps':
      return formatScaled(
        value,
        1000,
        SI_PREFIXES.map((p) => ` ${p}B/s`),
        SI_BASE_INDEX
      )
    case 'bytes':
      return formatScaled(
        value,
        1024,
        BIN_PREFIXES.map((p) => ` ${p}B`)
      )
    case 's':
      return formatSeconds(value)
    case 'ms':
      return formatSeconds(value / 1000)
    case 'percent':
      return formatPercent(value)
    case 'percentunit':
      return formatPercentUnit(value)
    case 'hertz':
      return formatFixedUnit(value, 'Hz')
    case 'celsius':
      return formatFixedUnit(value, '°C')
    case 'volt':
      return formatFixedUnit(value, 'V')
    case 'amp':
      return formatFixedUnit(value, 'A')
    case 'joule':
      return formatFixedUnit(value, 'J')
    case 'watt':
      return formatFixedUnit(value, 'W')
    case 'none':
    default:
      return formatNone(value)
  }
}
