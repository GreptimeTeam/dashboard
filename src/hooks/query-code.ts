import { CodeRunType } from '@/store/modules/code-run/types'
import { Message } from '@arco-design/web-vue'
import i18n from '@/locale'
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

const codes = ref({
  sql: sqlCode,
  promQL: promQLCode,
} as stringType)

const promForm = ref({
  start: '0',
  end: '0',
  step: '',
  isRelative: 1,
  time: 5,
  range: [],
})

export default function useQueryCode() {
  const { codeType } = storeToRefs(useAppStore())
  const { results } = storeToRefs(useCodeRunStore())
  const route = useRoute()

  const insertNameToQueryCode = (name: any) => {
    codes.value[queryType.value] =
      codes.value[queryType.value].substring(0, cursorAt.value[0]) +
      name +
      codes.value[queryType.value].substring(cursorAt.value[1])
  }

  const selectCodeType = () => {
    codeType.value = queryType.value
  }

  const run = async (code: any, type = queryType.value, withoutSave = false): Promise<CodeRunType> => {
    const { runCode } = useCodeRunStore()
    const { pushLog } = useLog()
    const res = await runCode(code, type, withoutSave)
    if (res.record) {
      Message.success({
        content: i18n.global.t('dataExplorer.runSuccess'),
        duration: 2 * 1000,
      })
    }
    if (!withoutSave) {
      pushLog(res.log, type)
    }
    return res
  }

  const getResultsByType = (types: string[]) => {
    return results.value.filter((item) => types.includes(item.type))
  }

  const queryCode = computed({
    get: () => {
      return codes.value[codeType.value] || ''
    },
    set: (val) => {
      codes.value[codeType.value] = val
    },
  })

  const isButtonDisabled = computed(() => {
    if (queryCode.value.trim().length === 0) return true
    if (queryType.value === 'promQL') {
      const hasRange = promForm.value.range ? promForm.value.range.length > 0 : false
      if (promForm.value.step.trim().length === 0 || (!promForm.value.isRelative && !hasRange)) {
        return true
      }
    }
    return false
  })

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
    run,
    queryCode,
    cursorAt,
    queryOptions,
    promForm,
    queryType,
    isButtonDisabled,
  }
}
