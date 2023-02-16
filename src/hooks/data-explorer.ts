import { number } from 'echarts'
import { stringType } from './types'

const sqlCode = 'SELECT * FROM numbers'
const promCode = ''
const cursorAt = ref<Array<number>>([])
const queryType = ref('promQL')
const start = 0
const end = 0
const step = ref<number>()
const isRelative = 1
const time = 5
const range = ref()
const queryOptions = [
  {
    value: 'sql',
    label: 'SQL',
  },
  {
    value: 'promQL',
    label: 'PromQL',
  },
]

const queryCode = ref({
  sql: sqlCode,
  promQL: promCode,
} as stringType)

const promForm = ref({
  start,
  end,
  step,
  isRelative,
  time,
  range,
})

export default function useDataExplorer() {
  const insertNameToCode = (name: any) => {
    queryCode.value[queryType.value] =
      queryCode.value[queryType.value].substring(0, cursorAt.value[0]) +
      name +
      queryCode.value[queryType.value].substring(cursorAt.value[1])
  }

  return {
    insertNameToCode,
    queryCode,
    cursorAt,
    queryOptions,
    queryType,
    promForm,
  }
}
