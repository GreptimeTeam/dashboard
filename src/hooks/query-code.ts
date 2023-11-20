import { Message } from '@arco-design/web-vue'
import i18n from '@/locale'
import dayjs from 'dayjs'
import { useCodeRunStore } from '@/store'
import { ResultType } from '@/store/modules/code-run/types'
import { TableTreeParent } from '@/store/modules/database/types'

import { EditorSelection } from '@codemirror/state'
import { sqlFormatter } from '@/utils'
import { stringType } from './types'

import useSiderTabs from './sider-tabs'

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

  const runQuery = async (code: any, type = queryType.value, withoutSave = false) => {
    const { pushLog } = useLog()
    const { runCode } = useCodeRunStore()
    const res = await runCode(code, type, withoutSave)

    if (!withoutSave && res.log) {
      pushLog(res.log, type)
    }

    if (type === 'sql') {
      const sql = sqlFormatter(code)

      const regex =
        /CREATE TABLE IF NOT EXISTS[^A-Za-z0-9_-]+[A-Za-z0-9_-]+|CREATE TABLE[^A-Za-z0-9_-]+[A-Za-z0-9_-]+|DROP TABLE[^A-Za-z0-9_-]+[A-Za-z0-9_-]+|ALTER TABLE[^A-Za-z0-9_-]+[A-Za-z0-9_-]+/g
      const matchString = sql.match(regex)

      const { refreshTables, loadMoreColumns, loadMoreDetails } = useSiderTabs()
      const { originTablesTree } = storeToRefs(useDataBaseStore())

      if (matchString !== null) {
        const matchArray = matchString[0].split(' ')
        const tableName = matchArray[matchArray.length - 1].match(/[A-Za-z0-9_-]+/g)?.[0]

        if (
          (matchString[0].includes('CREATE TABLE') && !matchString[0].includes('IF NOT EXISTS')) ||
          matchString[0].includes('DROP TABLE')
        ) {
          refreshTables()
        } else if (!matchString[0].includes('ALTER TABLE')) {
          const isNewTable =
            originTablesTree.value.findIndex((item: TableTreeParent) => item.title === tableName) === -1
          if (isNewTable) {
            refreshTables()
          }
        } else {
          // ALTER
          const tableNodeData = originTablesTree.value.find((item: TableTreeParent) => item.title === tableName)
          // Affect childrenType?
          loadMoreColumns(tableNodeData)
          loadMoreDetails(tableNodeData)
        }
      }
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
    if (codes.value[queryType.value].trim().length === 0) return true
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
    promForm,
    queryType,
    isButtonDisabled,
    primaryCodeRunning,
    secondaryCodeRunning,
    codes,
    clearCode,
  }
}
