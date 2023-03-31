import { useCodeRunStore } from '@/store'
import { stringType } from './types'

const queryType = ref('sql')
const sqlCode = 'SELECT * FROM system_metrics'
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
  const { codeType } = storeToRefs(useAppStore())
  const { results } = useCodeRunStore()
  const route = useRoute()

  const insertNameToQueryCode = (name: any) => {
    queryCode.value[queryType.value] =
      queryCode.value[queryType.value].substring(0, cursorAt.value[0]) +
      name +
      queryCode.value[queryType.value].substring(cursorAt.value[1])
  }

  const selectCodeType = () => {
    codeType.value = queryType.value
  }

  const run = async (code, type = queryType.value, withoutSave = false) => {
    const { runCode } = useCodeRunStore()
    const { pushLog } = useLog()
    const res = await runCode(code, type, withoutSave)
    if (!withoutSave) {
      pushLog(res.log, type)
    }
    return res
  }

  const getResultsByType = (types: string[]) => {
    return results.filter((item) => types.includes(item.type))
  }

  return {
    insertNameToQueryCode,
    selectCodeType,
    getResultsByType,
    queryCode,
    cursorAt,
    queryOptions,
    promForm,
    queryType,
    run,
  }
}
