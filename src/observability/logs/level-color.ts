/** Grafana logs-drilldown level colors (named colors resolved to hex). */
const LEVEL_HEX = {
  critical: '#B877D9',
  error: '#E02F44',
  warn: '#FF780A',
  info: '#5794F2',
  trace: '#6ED0E0',
} as const

export const UNKNOWN_LOG_LEVEL = 'unknown'

export function normalizeLogLevelName(level: string | null | undefined): string {
  const trimmed = level == null ? '' : String(level).trim()
  if (!trimmed || trimmed === '""') {
    return UNKNOWN_LOG_LEVEL
  }
  return trimmed
}

/** Lower rank is drawn first (bottom of the stack). Critical sits on top. */
export function logLevelRank(level: string): number {
  const name = normalizeLogLevelName(level).toLowerCase()
  if (/^(crit|critical|fatal|severe)$/.test(name)) return 6
  if (/^(error|errors|err|eror)$/.test(name)) return 5
  if (/^(warn|warning)$/.test(name)) return 4
  if (/^(info|information)$/.test(name)) return 3
  if (/^debug$/.test(name)) return 2
  if (/^trace$/.test(name)) return 1
  return 0
}

export function logLevelColor(level: string, isDark: boolean): string {
  const name = normalizeLogLevelName(level).toLowerCase()
  if (/^(crit|critical|fatal|severe)$/.test(name)) return LEVEL_HEX.critical
  if (/^(error|errors|err|eror)$/.test(name)) return LEVEL_HEX.error
  if (/^(warn|warning)$/.test(name)) return LEVEL_HEX.warn
  if (/^(info|information)$/.test(name)) return LEVEL_HEX.info
  if (/^trace$/.test(name)) return LEVEL_HEX.trace
  if (/^debug$/.test(name)) return isDark ? '#9e9e9e' : '#696969'
  return isDark ? '#8e8e8e' : '#bdc4cd'
}

/** Grafana short count: 94, 2.23 K, 26.0 K. */
export function formatLogCountShort(value: number): string {
  if (!Number.isFinite(value)) {
    return '0'
  }
  const sign = value < 0 ? '-' : ''
  const abs = Math.abs(value)
  if (abs < 1000) {
    return `${sign}${Math.round(abs)}`
  }
  const units = ['K', 'M', 'B', 'T']
  let scaled = abs
  let unit = 'K'
  for (let index = 0; index < units.length; index += 1) {
    scaled /= 1000
    unit = units[index]
    if (scaled < 1000 || index === units.length - 1) {
      break
    }
  }
  let decimals = 2
  if (scaled >= 100) {
    decimals = 0
  } else if (scaled >= 10) {
    decimals = 1
  }
  return `${sign}${scaled.toFixed(decimals)} ${unit}`
}
