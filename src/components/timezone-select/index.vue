<template lang="pug">
a-select(
  v-model="timezoneSelectValue"
  allow-search
  allow-create
  :options="timezoneOptions"
  :trigger-props="{ autoFitPopupMinWidth: true }"
)
</template>

<script lang="ts" setup>
  import { computed } from 'vue'
  import { useI18n } from 'vue-i18n'
  import {
    formatOffsetLabel,
    getBrowserTimezone,
    getTimezoneFullLabel,
    getTimezoneShortLabel,
    isValidIanaTimezone,
    isValidTimezoneSetting,
  } from '@/utils/timezone'

  const props = defineProps<{ modelValue: string }>()
  const emit = defineEmits<{ (e: 'update:modelValue', value: string): void }>()

  const { t } = useI18n()

  // Arco select treats '' as "no value", so the browser default uses a sentinel in the UI only.
  const BROWSER_TZ_VALUE = '__browser__'

  const normalizeTimezoneChoice = (val: string | undefined | null): string => {
    if (!val || val === BROWSER_TZ_VALUE) return ''
    const tz = val.trim()
    return tz.toUpperCase() === 'UTC' ? 'UTC' : tz
  }

  const timezoneSelectValue = computed({
    get: () => props.modelValue || BROWSER_TZ_VALUE,
    set: (val: string) => emit('update:modelValue', normalizeTimezoneChoice(val)),
  })

  // Whole hours from -12 to +14, plus the real-world half/quarter-hour offsets.
  const OFFSET_MINUTES = [
    ...Array.from({ length: 27 }, (_, i) => (i - 12) * 60).filter((m) => m !== 0),
    -570,
    -210,
    210,
    270,
    330,
    345,
    390,
    570,
    630,
    765,
  ].sort((a, b) => a - b)

  const REGION_TIMEZONES = [
    'America/Los_Angeles',
    'America/Denver',
    'America/Chicago',
    'America/New_York',
    'America/Sao_Paulo',
    'Europe/London',
    'Europe/Paris',
    'Europe/Berlin',
    'Europe/Moscow',
    'Asia/Dubai',
    'Asia/Kolkata',
    'Asia/Singapore',
    'Asia/Shanghai',
    'Asia/Hong_Kong',
    'Asia/Tokyo',
    'Asia/Seoul',
    'Australia/Sydney',
    'Pacific/Auckland',
  ]

  const toOffsetValue = (minutes: number) => {
    const sign = minutes > 0 ? '+' : '-'
    const abs = Math.abs(minutes)
    return `${sign}${String(Math.floor(abs / 60)).padStart(2, '0')}:${String(abs % 60).padStart(2, '0')}`
  }

  const timezoneOptions = computed(() => {
    const browserTz = getBrowserTimezone()
    const known = new Set<string>(['UTC', ...REGION_TIMEZONES])
    const offsets = OFFSET_MINUTES.map((m) => {
      const value = toOffsetValue(m)
      known.add(value)
      return { label: formatOffsetLabel(m), value }
    })
    const regions = REGION_TIMEZONES.filter(isValidIanaTimezone).map((tz) => ({
      label: `${tz} (${getTimezoneShortLabel(tz)})`,
      value: tz,
    }))
    const current = props.modelValue
    if (current && !known.has(current) && isValidTimezoneSetting(current)) {
      regions.unshift({ label: getTimezoneFullLabel(current), value: current })
    }
    return [
      {
        isGroup: true,
        label: t('settings.timezoneGroupCommon'),
        options: [
          {
            label: `${t('settings.timezoneBrowser')} · ${browserTz} (${getTimezoneShortLabel('')})`,
            value: BROWSER_TZ_VALUE,
          },
          { label: 'UTC', value: 'UTC' },
        ],
      },
      { isGroup: true, label: t('settings.timezoneGroupRegions'), options: regions },
      { isGroup: true, label: t('settings.timezoneGroupOffsets'), options: offsets },
    ]
  })
</script>
