import { computed } from 'vue'
import dayjs from 'dayjs'
import utc from 'dayjs/plugin/utc'
import timezone from 'dayjs/plugin/timezone'
import { storeToRefs } from 'pinia'
import { useAppStore } from '@/store'

dayjs.extend(utc)
dayjs.extend(timezone)

const OFFSET_REGEX = /^[+-]\d{2}:\d{2}$/

function parseOffsetMinutes(offset: string): number {
  const sign = offset.startsWith('-') ? -1 : 1
  const [hours, minutes] = offset
    .slice(1)
    .split(':')
    .map((item) => Number(item))
  return sign * (hours * 60 + minutes)
}

// eslint-disable-next-line import/prefer-default-export
export function useDashboardTimezone() {
  const { userTimezone } = storeToRefs(useAppStore())

  const browserOffset = dayjs().utcOffset()

  const dashboardOffset = computed(() => {
    const tz = userTimezone.value
    if (!tz) return browserOffset
    if (tz === 'UTC') return 0
    if (OFFSET_REGEX.test(tz)) return parseOffsetMinutes(tz)
    return browserOffset
  })

  // offsetDiff = dashboardOffset - browserOffset
  // Used to convert between dashboard timezone time and browser timezone time
  // When displaying: add offsetDiff to show dashboard timezone time in browser timezone
  // When converting back: subtract offsetDiff to restore to browser timezone time
  const offsetDiff = computed(() => dashboardOffset.value - browserOffset)

  const toBrowserTimezoneTimestamp = (value: Date) => dayjs(value).subtract(offsetDiff.value, 'minute').unix()

  const toDashboardDate = (value: string | number) => dayjs.unix(Number(value)).add(offsetDiff.value, 'minute').toDate()

  // Timezone label formatter: 'UTC' stays 'UTC', '+08:00' -> 'UTC+8', '-05:00' -> 'UTC-5'
  const timezoneLabel = computed(() => {
    const tz = userTimezone.value
    if (!tz) {
      // Format browser timezone label
      return ''
    }
    if (tz === 'UTC') return 'UTC'
    // Expect tz like '+08:00' or '-05:00'
    const sign = tz.startsWith('-') ? '-' : '+'
    const hours = Number(tz.slice(1, 3))
    return `UTC${sign}${hours}`
  })

  return {
    browserOffset,
    dashboardOffset,
    offsetDiff,
    toBrowserTimezoneTimestamp,
    toDashboardDate,
    timezoneLabel,
  }
}
