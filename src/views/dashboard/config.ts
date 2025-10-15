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

export const relativeTimeOptions = [
  { value: 1, label: i18n.global.t('time-select.last1Minute') },
  { value: 10, label: i18n.global.t('time-select.last10Minutes') },
  { value: 30, label: i18n.global.t('time-select.last30Minutes') },
  { value: 60, label: i18n.global.t('time-select.last1Hour') },
  { value: 180, label: i18n.global.t('time-select.last3Hours') },
  { value: 360, label: i18n.global.t('time-select.last6Hours') },
  { value: 720, label: i18n.global.t('time-select.last12Hours') },
  { value: 1440, label: i18n.global.t('time-select.last24Hours') },
  { value: 2880, label: i18n.global.t('time-select.last2Days') },
  { value: 10080, label: i18n.global.t('time-select.last7Days') },
]

export const relativeTimeMap: { [key: number]: string } = {
  1: i18n.global.t('time-select.last1Minute'),
  10: i18n.global.t('time-select.last10Minutes'),
  30: i18n.global.t('time-select.last30Minutes'),
  60: i18n.global.t('time-select.last1Hour'),
  180: i18n.global.t('time-select.last3Hours'),
  360: i18n.global.t('time-select.last6Hours'),
  720: i18n.global.t('time-select.last12Hours'),
  1440: i18n.global.t('time-select.last24Hours'),
  2880: i18n.global.t('time-select.last2Days'),
  10080: i18n.global.t('time-select.last7Days'),
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
