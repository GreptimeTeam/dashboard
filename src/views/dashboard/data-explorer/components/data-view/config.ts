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
