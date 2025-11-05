import { computed } from 'vue'
import { storeToRefs } from 'pinia'
import dayjs from 'dayjs'
import utc from 'dayjs/plugin/utc'
import { useAppStore } from '@/store'
import { convertTimestampToMilliseconds } from '@/utils/date-time'

dayjs.extend(utc)

const OFFSET_REGEX = /^[+-]\d{2}:\d{2}$/

/**
 * Parse offset string like '+08:00' or '-05:00' to minutes
 */
function parseOffsetMinutes(offset: string): number {
  const sign = offset.startsWith('-') ? -1 : 1
  const [hours, minutes] = offset
    .slice(1)
    .split(':')
    .map((item) => Number(item))
  return sign * (hours * 60 + minutes)
}

/**
 * Format a timestamp value according to dashboard timezone
 * @param timestamp - The timestamp value (can be in various formats)
 * @param dataType - The data type string (e.g., 'TimestampSecond', 'Date', 'DateTime')
 * @param format - The format string (default: 'YYYY-MM-DD HH:mm:ss')
 * @returns Formatted date string or null
 */
function formatTimestampInTimezone(
  timestamp: number | null,
  dataType: string,
  timezone: string,
  format = 'YYYY-MM-DD HH:mm:ss'
): string | null {
  if (!timestamp && timestamp !== 0) return null

  let ms: number

  // Convert timestamp to milliseconds based on data type
  switch (dataType) {
    case 'Date':
      ms = dayjs(0).add(timestamp, 'day').valueOf()
      break
    case 'DateTime':
      ms = timestamp
      break
    default:
      // Use the universal timestamp conversion utility for all timestamp types
      ms = convertTimestampToMilliseconds(timestamp, dataType)
      break
  }

  // Convert to dayjs instance from milliseconds
  const date = dayjs(ms)

  // Apply timezone offset if needed
  if (!timezone) {
    // If timezone is empty, use browser timezone (no conversion, just format with local time)
    return date.format(format)
  }
  if (timezone === 'UTC') {
    return date.utc().format(format)
  }

  // Handle offset format like '+08:00' or '-05:00'
  if (OFFSET_REGEX.test(timezone)) {
    const offsetMinutes = parseOffsetMinutes(timezone)
    // Adjust the UTC time by the offset
    const adjustedDate = date.utc().add(offsetMinutes, 'minute')
    return adjustedDate.format(format)
  }

  // Fallback: use browser timezone if timezone format is not recognized
  return date.format(format)
}

/**
 * Composable for formatting datetime values according to dashboard timezone setting
 *
 * @example
 * ```ts
 * const { formatDateTime, formatDateTimeWithMs } = useDateTimeFormat()
 *
 * // Format a timestamp value
 * const formatted = formatDateTime(1234567890, 'TimestampSecond')
 *
 * // Format with custom format string
 * const customFormatted = formatDateTime(1234567890, 'TimestampSecond', 'YYYY-MM-DD')
 * ```
 */

// eslint-disable-next-line import/prefer-default-export
export function useDateTimeFormat() {
  const { userTimezone } = storeToRefs(useAppStore())

  /**
   * Format a timestamp value according to dashboard timezone
   * @param timestamp - The timestamp value (can be in various formats)
   * @param dataType - The data type string (e.g., 'TimestampSecond', 'Date', 'DateTime')
   * @param format - Optional format string (default: 'YYYY-MM-DD HH:mm:ss')
   * @returns Formatted date string or null
   */
  const formatDateTime = (
    timestamp: number | null,
    dataType: string,
    format = 'YYYY-MM-DD HH:mm:ss'
  ): string | null => {
    return formatTimestampInTimezone(timestamp, dataType, userTimezone.value, format)
  }

  /**
   * Format a timestamp value with milliseconds precision
   * @param timestamp - The timestamp value
   * @param dataType - The data type string
   * @returns Formatted date string with milliseconds or null
   */
  const formatDateTimeWithMs = (timestamp: number | null, dataType: string): string | null => {
    return formatTimestampInTimezone(timestamp, dataType, userTimezone.value, 'YYYY-MM-DD HH:mm:ss.SSS')
  }

  /**
   * Format a timestamp value for date only (no time)
   * @param timestamp - The timestamp value
   * @param dataType - The data type string
   * @returns Formatted date string or null
   */
  const formatDate = (timestamp: number | null, dataType: string, format = 'YYYY-MM-DD'): string | null => {
    return formatTimestampInTimezone(timestamp, dataType, userTimezone.value, format)
  }

  /**
   * Format a timestamp value for time only (no date)
   * @param timestamp - The timestamp value
   * @param dataType - The data type string
   * @returns Formatted time string or null
   */
  const formatTime = (timestamp: number | null, dataType: string, format = 'HH:mm:ss'): string | null => {
    return formatTimestampInTimezone(timestamp, dataType, userTimezone.value, format)
  }

  return {
    formatDateTime,
    formatDateTimeWithMs,
    formatDate,
    formatTime,
    timezone: computed(() => userTimezone.value),
  }
}
