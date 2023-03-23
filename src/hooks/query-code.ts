import { stringType } from './types'

const queryType = ref('sql')
const sqlCode = 'SELECT * FROM numbers'
const promQLCode = ''
const cursorAt = ref<Array<number>>([])
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
  promQL: promQLCode,
} as stringType)

const promForm = ref({
  start,
  end,
  step,
  isRelative,
  time,
  range,
})

export default function useQueryCode() {
  const insertNameToQueryCode = (name: any) => {
    queryCode.value[queryType.value] =
      queryCode.value[queryType.value].substring(0, cursorAt.value[0]) +
      name +
      queryCode.value[queryType.value].substring(cursorAt.value[1])
  }

  return {
    insertNameToQueryCode,
    queryCode,
    cursorAt,
    queryOptions,
    promForm,
    queryType,
  }
}
