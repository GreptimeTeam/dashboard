import dayjs from 'dayjs'

export const calculateRange = (timeLength: number, timeRange: string[], now?: dayjs.Dayjs) => {
  if (!now) {
    now = dayjs()
  }
  if (!timeLength) {
    return timeRange
  }
  const end = now.unix().toString()
  const start = now.subtract(timeLength, 'minute').unix().toString()
  return [start, end]
}

const secondsFormat = (s: number) => {
  // TODO
  return s
}

export const calculateStep = (range: number[], maxDataPoints: number, minStep?: number) => {
  if (!minStep) {
    minStep = 15 // default to be 15 seconds
  }
  let step = (range[1] - range[0]) / maxDataPoints

  step = secondsFormat(Math.floor(step))
  if (minStep > step) {
    return `${minStep}`
  }

  return `${step}`
}

export const TsTypeMapping = {
  'timestamp(9)': 'TimestampNanosecond',
  'timestamp(6)': 'TimestampMicrosecond',
  'timestamp(3)': 'TimestampMillisecond',
  'timestamp(0)': 'TimestampSecond',
  'timestamp': 'TimestampSecond',
  'date': 'Date',
  'datetime': 'DateTime',
}

/**
 * Converts a timestamp to milliseconds based on its data type
 * @param timestamp - The timestamp value to convert
 * @param dataType - The data type string indicating the timestamp precision
 * @returns The timestamp converted to milliseconds
 */
export function convertTimestampToMilliseconds(timestamp: number, dataType: string): number {
  const type = dataType.toLowerCase()

  // Determine the source unit and convert to milliseconds
  if (type.includes('timestampsecond')) {
    // Seconds to milliseconds: multiply by 1000
    return timestamp * 1000
  }
  if (type.includes('timestampmillisecond')) {
    // Already in milliseconds: no conversion needed
    return timestamp
  }
  if (type.includes('timestampmicrosecond')) {
    // Microseconds to milliseconds: divide by 1000
    return timestamp / 1000
  }
  if (type.includes('timestampnanosecond')) {
    // Nanoseconds to milliseconds: divide by 1,000,000
    return timestamp / 1000000
  }

  // Fallback: try regex pattern for timestamp(n) format
  const multipleRe = /timestamp\((\d)\)/i
  const timescale = multipleRe.exec(dataType)
  if (timescale) {
    const precision = Number(timescale[1])
    // precision 0 = seconds, 3 = milliseconds, 6 = microseconds, 9 = nanoseconds
    const conversionFactor = 10 ** (precision - 3)
    return timestamp / conversionFactor
  }

  // Default fallback: assume seconds
  return timestamp * 1000
}

export default null
