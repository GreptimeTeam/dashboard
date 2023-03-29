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

export const numberTypes = [
  'Int8',
  'Int16',
  'Int32',
  'Int64',
  'UInt8',
  'UInt16',
  'UInt32',
  'UInt64',
  'Float32',
  'Float64',
]

export const dateTypes = ['Date', 'DateTime', 'Timestamp', 'TimestampMillisecond']

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

export const durations = [
  { key: 'ms', value: 'milliseconds' },
  { key: 's', value: 'seconds' },
  { key: 'm', value: 'minutes' },
  { key: 'h', value: 'hours' },
  { key: 'd', value: 'days - assuming a day has always 24h' },
  { key: 'w', value: 'weeks - assuming a week has always 7d' },
  { key: 'y', value: 'years - assuming a year has always 365d' },
]

export const durationExamples = ['1h', '5d1m', '5m', '10s']
