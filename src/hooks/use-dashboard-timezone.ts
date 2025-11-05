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

  const offsetDiff = computed(() => dashboardOffset.value - browserOffset)

  const toUtcUnix = (value: Date) => dayjs(value).subtract(offsetDiff.value, 'minute').unix()
  const toTimezoneDate = (value: string | number) => dayjs.unix(Number(value)).add(offsetDiff.value, 'minute').toDate()

  return {
    browserOffset,
    dashboardOffset,
    offsetDiff,
    toUtcUnix,
    toTimezoneDate,
  }
}
