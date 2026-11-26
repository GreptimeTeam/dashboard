export { numberTypes, dateTypes, timestampTypes } from '@/constants/column-types'

export const chartTypeOptions: any = [
  {
    key: 1,
    value: 'scatter',
  },
  {
    key: 2,
    value: 'line',
  },
  {
    key: 3,
    value: 'line(smooth)',
  },
  {
    key: 4,
    value: 'bar',
  },
]

export const updateOptions = { notMerge: true }

export const dataTypesMap = {
  Int8: 'number',
  Int16: 'number',
  Int32: 'number',
  Int64: 'number',
  UInt8: 'number',
  UInt16: 'number',
  UInt32: 'number',
  UInt64: 'number',
  Float32: 'number',
  Float64: 'number',
  Date: 'date',
  DateTime: 'date',
  Timestamp: 'date',
  TimestampMillisecond: 'date',
}

export const getDurations = (t: (key: string) => string) => [
  { key: 'ms', value: t('dashboard.durationMs') },
  { key: 's', value: t('dashboard.durationS') },
  { key: 'm', value: t('dashboard.durationM') },
  { key: 'h', value: t('dashboard.durationH') },
  { key: 'd', value: t('dashboard.durationD') },
  { key: 'w', value: t('dashboard.durationW') },
  { key: 'y', value: t('dashboard.durationY') },
]

export const durationExamples = ['1h', '5d1m', '5m', '10s']

export const timeOptionsArray = [5, 10, 15, 30, 60]

// Locale-aware labels for the quick time-length options.
export const getQueryTimeMap = (t: (key: string) => string): { [key: number]: string } => ({
  5: t('time-select.last5Minutes'),
  10: t('time-select.last10Minutes'),
  15: t('time-select.last15Minutes'),
  30: t('time-select.last30Minutes'),
  60: t('time-select.last60Minutes'),
})

// New: `TAG`, `FIELD`, `TIMESTAMP`
// Old: `PRIMARY KEY`, `FIELD`, `TIME INDEX`
export const SEMANTIC_TYPE_MAP: { [key: string]: string } = {
  'FIELD': 'FIELD',
  'TAG': 'TAG',
  'PRIMARY KEY': 'TAG',
  'TIMESTAMP': 'TIMESTAMP',
  'TIME INDEX': 'TIMESTAMP',
}

export const getRelativeTimeOptions = (t: (key: string) => string) => [
  { value: 1, label: t('time-select.last1Minute') },
  { value: 10, label: t('time-select.last10Minutes') },
  { value: 30, label: t('time-select.last30Minutes') },
  { value: 60, label: t('time-select.last1Hour') },
  { value: 180, label: t('time-select.last3Hours') },
  { value: 360, label: t('time-select.last6Hours') },
  { value: 720, label: t('time-select.last12Hours') },
  { value: 1440, label: t('time-select.last24Hours') },
  { value: 2880, label: t('time-select.last2Days') },
  { value: 10080, label: t('time-select.last7Days') },
]

export const getRelativeTimeMap = (t: (key: string) => string): { [key: number]: string } => ({
  1: t('time-select.last1Minute'),
  10: t('time-select.last10Minutes'),
  30: t('time-select.last30Minutes'),
  60: t('time-select.last1Hour'),
  180: t('time-select.last3Hours'),
  360: t('time-select.last6Hours'),
  720: t('time-select.last12Hours'),
  1440: t('time-select.last24Hours'),
  2880: t('time-select.last2Days'),
  10080: t('time-select.last7Days'),
})

export const getTimeOptionsForEdge = (t: (key: string) => string) => [
  { value: 1440, label: t('time-select.last24Hours') },
  { value: 2880, label: t('time-select.last2Days') },
  { value: 4320, label: t('time-select.last3Days') },
]
