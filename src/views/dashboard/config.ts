import { DriveStep } from 'driver.js'
import i18n from '@/locale'

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
  // 'Decimal',
]

export const dateTypes = [
  'Date',
  'DateTime',
  'TimestampSecond',
  'TimestampMillisecond',
  'TimestampMicrosecond',
  'TimestampNanosecond',
]

export const timestampTypes = ['TimestampSecond', 'TimestampMillisecond', 'TimestampMicrosecond', 'TimestampNanosecond']

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

export const timeOptionsArray = [5, 10, 15, 30, 60]

export const queryTimeMap: { [key: number]: string } = {
  5: 'Last 5 minutes',
  10: 'Last 10 minutes',
  15: 'Last 15 minutes',
  30: 'Last 30 minutes',
  60: 'Last 60 minutes',
}

// New: `TAG`, `FIELD`, `TIMESTAMP`
// Old: `PRIMARY KEY`, `FIELD`, `TIME INDEX`
export const SEMANTIC_TYPE_MAP: { [key: string]: string } = {
  'FIELD': 'FIELD',
  'TAG': 'TAG',
  'PRIMARY KEY': 'TAG',
  'TIMESTAMP': 'TIMESTAMP',
  'TIME INDEX': 'TIMESTAMP',
}

export const navbarSteps: DriveStep[] = [
  {
    element: '#menu-query',
    popover: {
      title: i18n.global.t('menu.dashboard.query'),
      description: i18n.global.t('menu.tour.query'),
    },
  },
  {
    element: '#menu-ingest',
    popover: {
      title: i18n.global.t('menu.dashboard.ingest'),
      description: i18n.global.t('menu.tour.ingest'),
    },
  },
]

export const tableSteps: DriveStep[] = [
  {
    element: '#table-0',
    popover: {
      description: '',
      side: 'right',
      popoverClass: 'table-buttons global',
      onPopoverRender(popover) {
        const icons = ['columns', 'details', 'query', 'copy-new']
        const div = document.createElement('div')
        const hintTitles = [
          i18n.global.t('dashboard.columns'),
          i18n.global.t('dashboard.details'),
          i18n.global.t('dashboard.quickSelect'),
          'Copy',
        ]
        const hints = [
          i18n.global.t('dashboard.hints.columns'),
          i18n.global.t('dashboard.hints.details'),
          i18n.global.t('dashboard.hints.quickSelect'),
          i18n.global.t('dashboard.hints.copy'),
        ]
        const title = document.createElement('div')
        title.className = 'title'
        title.innerHTML = 'Table Menu'
        div.appendChild(title)
        for (let i = 0; i < 4; i += 1) {
          const row = document.createElement('row')
          row.style.display = 'flex'
          row.className = 'row'
          const iconButton = document.createElement('div')
          iconButton.className = 'icon-button'
          iconButton.innerHTML = `<svg class="icon-16 brand-color"><use href="#${icons[i]}"></use></svg>`
          row.appendChild(iconButton)
          const hint = document.createElement('div')
          hint.className = 'hint'
          const hintTitle = document.createElement('div')
          hintTitle.className = 'hint-title'
          hintTitle.innerHTML = hintTitles[i]
          const hintDescription = document.createElement('div')
          hintDescription.className = 'hint-description'
          hintDescription.innerHTML = hints[i]
          hint.appendChild(hintTitle)
          hint.appendChild(hintDescription)
          row.appendChild(hint)
          div.appendChild(row)
        }
        popover.wrapper.insertBefore(div, popover.wrapper.firstChild)
      },
    },
  },
]

const navbarStepElements = navbarSteps.map((step) => step.element)

const tableStepElements = tableSteps.map((step) => step.element)

export const relativeTimeOptions = [
  { value: 1, label: 'Last 1 minute' },
  { value: 10, label: 'Last 10 minutes' },
  { value: 30, label: 'Last 30 minutes' },
  { value: 60, label: 'Last 1 hour' },
  { value: 180, label: 'Last 3 hours' },
  { value: 360, label: 'Last 6 hours' },
  { value: 720, label: 'Last 12 hours' },
  { value: 1440, label: 'Last 24 hours' },
  { value: 2880, label: 'Last 2 days' },
  { value: 10080, label: 'Last 7 days' },
]

export const relativeTimeMap: { [key: number]: string } = {
  1: 'Last 1 minute',
  10: 'Last 10 minutes',
  30: 'Last 30 minutes',
  60: 'Last 1 hour',
  180: 'Last 3 hours',
  360: 'Last 6 hours',
  720: 'Last 12 hours',
  1440: 'Last 24 hours',
  2880: 'Last 2 days',
  10080: 'Last 7 days',
}
