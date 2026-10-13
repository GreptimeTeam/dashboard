import { computed } from 'vue'
import dayjs from 'dayjs'
import { storeToRefs } from 'pinia'
import { useI18n } from 'vue-i18n'
import { useAppStore } from '@/store'
import { getOffsetMinutes, getTimezoneFullLabel, getTimezoneShortLabel, resolveTimezone } from '@/utils/timezone'

// eslint-disable-next-line import/prefer-default-export
export function useDashboardTimezone() {
  const { t } = useI18n()
  const { userTimezone } = storeToRefs(useAppStore())

  const browserOffset = dayjs().utcOffset()

  const dashboardOffset = computed(() => getOffsetMinutes(userTimezone.value))

  // offsetDiff = dashboardOffset - browserOffset (at a given instant, so DST is respected).
  // Pickers render browser-local Dates: add the diff to show dashboard wall-clock time,
  // subtract it to turn a picked wall-clock time back into a real instant.
  const offsetDiffAt = (ms: number) => getOffsetMinutes(userTimezone.value, ms) - dayjs(ms).utcOffset()

  const offsetDiff = computed(() => dashboardOffset.value - browserOffset)

  // Arco RangePicker `@ok` may pass formatted strings, not Date — parse via dayjs.
  const toBrowserTimezoneTimestamp = (value: Date | string | number) => {
    const ms = dayjs(value).valueOf()
    return dayjs(ms).subtract(offsetDiffAt(ms), 'minute').unix()
  }

  const toDashboardDate = (value: string | number) => {
    const ms = Number(value) * 1000
    return dayjs(ms).add(offsetDiffAt(ms), 'minute').toDate()
  }

  /** Short label, e.g. `UTC`, `UTC+8`, `UTC+5:30`. Never empty (falls back to browser offset). */
  const timezoneLabel = computed(() => getTimezoneShortLabel(userTimezone.value))

  /** Descriptive label, e.g. `Asia/Shanghai (UTC+8)` or `Browser · Asia/Shanghai (UTC+8)`. */
  const timezoneFullLabel = computed(() => getTimezoneFullLabel(userTimezone.value, t('settings.timezoneBrowser')))

  /**
   * Inline labels (pickers, table headers) only when the dashboard timezone differs from
   * what the user's clock shows; the status bar and tooltips always carry the timezone.
   */
  const showTimezoneLabel = computed(() => {
    if (resolveTimezone(userTimezone.value).kind === 'browser') return false
    const now = Date.now()
    return getOffsetMinutes(userTimezone.value, now) !== dayjs(now).utcOffset()
  })

  return {
    browserOffset,
    dashboardOffset,
    offsetDiff,
    offsetDiffAt,
    toBrowserTimezoneTimestamp,
    toDashboardDate,
    timezoneLabel,
    timezoneFullLabel,
    showTimezoneLabel,
  }
}
