import { Message } from '@arco-design/web-vue'
import i18n from '@/locale'
import dayjs from 'dayjs'
import { useCodeRunStore } from '@/store'
import { ResultType } from '@/store/modules/code-run/types'
import { EditorSelection } from '@codemirror/state'
import { stringType } from './types'

const view = shallowRef()
const queryType = ref('sql')
const sqlCode = ''
const promQLCode = ''
const primaryCodeRunning = ref(false)
const secondaryCodeRunning = ref(false)
const cursorAt = ref<Array<number>>([])
const queryOptions = [
  {
    value: 'sql',
    label: 'SQL',
  },
  {
    value: 'promql',
    label: 'PromQL',
  },
]

const codes = ref({
  sql: sqlCode,
  promql: promQLCode,
} as stringType)

const promForm = ref({
  start: '0',
  end: '0',
  step: '15s',
  isRelative: 1,
  time: 5,
  range: [dayjs().subtract(5, 'minute').unix().toString(), dayjs().unix().toString()],
})

export default function useQueryCode() {
  const { codeType } = storeToRefs(useAppStore())
  const { results } = storeToRefs(useCodeRunStore())

  // Deprecated
  const insertNameToQueryCode = (name: string) => {
    const { state } = view.value
    view.value.dispatch(state.replaceSelection(`${name}`))
  }

  const inputFromNewLineToQueryCode = (code: string, cursorBack: number) => {
    const { state } = view.value

    const lastLineCode = state.doc.text[state.doc.text.length - 1]
    let changes
    let cursorPosition
    if (lastLineCode.trim() === '') {
      // If the last line is empty, start here
      changes = {
        from: state.doc.length,
        insert: `${code}`,
        // TODO: Scroll not working,
        scrollIntoView: true,
      }
      cursorPosition = state.doc.length + code.length - cursorBack
    } else {
      // If the last line is not empty, start from new line
      changes = {
        from: state.doc.length,
        insert: `\n${code}`,
        scrollIntoView: true,
      }
      cursorPosition = state.doc.length + code.length + 1 - cursorBack
    }
    view.value.focus()
    view.value.dispatch({
      changes,
      selection: EditorSelection.create([EditorSelection.cursor(cursorPosition)]),
    })
  }

  const selectCodeType = () => {
    codeType.value = queryType.value
  }

  const runQuery = async (code: any, type = queryType.value, withoutSave = false) => {
    const { pushLog } = useLog()
    const { runCode } = useCodeRunStore()
    const res = await runCode(code, type, withoutSave)

    if (!withoutSave && res.log) {
      pushLog(res.log, type)
    }
    return res
  }

  const getResultsByType = (types: string[]) => {
    return results.value.filter((item: ResultType) => types.includes(item.type))
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
    if (queryType.value === 'promql') {
      const hasRange = promForm.value.range ? promForm.value.range.length > 0 : false
      if (promForm.value.step.trim().length === 0 || (!promForm.value.isRelative && !hasRange)) {
        return true
      }
    }
    if (primaryCodeRunning.value || secondaryCodeRunning.value) return true
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
    runQuery,
    inputFromNewLineToQueryCode,
    view,
    queryCode,
    cursorAt,
    queryOptions,
    promForm,
    queryType,
    isButtonDisabled,
    primaryCodeRunning,
    secondaryCodeRunning,
  }
}
