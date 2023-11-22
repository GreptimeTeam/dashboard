import { useCodeRunStore } from '@/store'
import { ResultType, PromForm } from '@/store/modules/code-run/types'
import { EditorSelection } from '@codemirror/state'
import { stringType } from './types'

const sqlView = shallowRef()
const promqlView = shallowRef()

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

export default function useQueryCode() {
  const { codeType } = storeToRefs(useAppStore())
  const { results } = storeToRefs(useCodeRunStore())

  // Deprecated
  // const insertNameToQueryCode = (name: string) => {
  //   const { state } = view.value
  //   view.value.dispatch(state.replaceSelection(`${name}`))
  // }

  const inputFromNewLineToQueryCode = (code: string, cursorBack: number) => {
    queryType.value = 'sql'
    codeType.value = 'sql'
    const { state } = sqlView.value
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
    sqlView.value.focus()
    sqlView.value.dispatch({
      changes,
      selection: EditorSelection.create([EditorSelection.cursor(cursorPosition)]),
    })
  }

  const selectCodeType = () => {
    codeType.value = queryType.value
  }

  const runQuery = async (
    code: any,
    type = queryType.value,
    withoutSave = false,
    params: PromForm = {} as PromForm
  ) => {
    const { pushLog } = useLog()
    const { runCode } = useCodeRunStore()
    const res = await runCode(code, type, withoutSave, params)
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

  const clearCode = () => {
    codes.value[queryType.value] = ''
  }

  const replaceCode = (code: string) => {
    queryType.value = 'promql'
    codeType.value = 'promql'
    codes.value.promql = code
  }
  return {
    selectCodeType,
    getResultsByType,
    runQuery,
    inputFromNewLineToQueryCode,
    replaceCode,
    sqlView,
    promqlView,
    queryCode,
    cursorAt,
    queryOptions,
    queryType,
    primaryCodeRunning,
    secondaryCodeRunning,
    codes,
    clearCode,
  }
}
