import { CodeRunType } from '@/store/modules/code-run/types'
import { Message } from '@arco-design/web-vue'
import { useI18n } from 'vue-i18n'
import { useCodeRunStore } from '@/store'
import { stringType } from './types'

const queryType = ref('sql')
const sqlCode = 'SELECT * FROM numbers'
const promQLCode = ''
const cursorAt = ref<Array<number>>([])

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
  start: '0',
  end: '0',
  step: null,
  isRelative: 1,
  time: 5,
  range: [],
})

export default function useQueryCode() {
  const { codeType } = storeToRefs(useAppStore())
  const { results } = storeToRefs(useCodeRunStore())
  const route = useRoute()
  const i18 = useI18n()

  const insertNameToQueryCode = (name: any) => {
    queryCode.value[queryType.value] =
      queryCode.value[queryType.value].substring(0, cursorAt.value[0]) +
      name +
      queryCode.value[queryType.value].substring(cursorAt.value[1])
  }

  const selectCodeType = () => {
    codeType.value = queryType.value
  }

  const run = async (code: any, type = queryType.value, withoutSave = false): Promise<CodeRunType> => {
    const { runCode } = useCodeRunStore()
    const { pushLog } = useLog()
    const res = await runCode(code, type, withoutSave)
    Message.success({
      content: i18.t('dataExplorer.runSuccess'),
      duration: 2 * 1000,
    })
    if (!withoutSave) {
      pushLog(res.log, type)
    }
    return res
  }

  const getResultsByType = (types: string[]) => {
    return results.value.filter((item) => types.includes(item.type))
  }
  watchEffect(() => {
    if (promForm.value.time === 0) {
      promForm.value.isRelative = 0
      promForm.value.time = 5
    }
  })

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
