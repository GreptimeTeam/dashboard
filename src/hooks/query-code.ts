import { useCodeRunStore } from '@/store'
import { ResultType, PromForm } from '@/store/modules/code-run/types'
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

export default function useQueryCode() {
  const { results } = storeToRefs(useCodeRunStore())

  const inputFromNewLineToQueryCode = (code: string, cursorBack: number) => {
    queryType.value = 'sql'
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

  const runQuery = async (
    code: string,
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
    if (!res.error && type === 'sql') {
      const sql = sqlFormatter(code)

      const regex =
        /CREATE TABLE IF NOT EXISTS(\s)+(\S)+|CREATE TABLE(\s)+(\S)+|DROP TABLE(\s)+(\S)+|ALTER TABLE(\s)+(\S)+/g
      const matchString = sql.match(regex)?.[0] || ''

      const { refreshTables, loadMoreColumns, loadMoreDetails } = useSiderTabs()
      const { originTablesTree } = storeToRefs(useDataBaseStore())

      if (matchString !== '') {
        const matchArray = matchString.split(' ')
        let tableName = matchArray[matchArray.length - 1]
        if (tableName.startsWith(`'`) || tableName.startsWith(`"`)) {
          tableName = tableName.slice(1, tableName.length - 1)
        }
        if (
          (matchString.includes('CREATE TABLE') && !matchString.includes('IF NOT EXISTS')) ||
          matchString.includes('DROP TABLE')
        ) {
          // CREATE NEW TABLE OR DROP TABLE
          refreshTables()
        } else if (!matchString.includes('ALTER TABLE')) {
          // CREATE TABLE IF NOT EXIST
          const isNewTable =
            originTablesTree.value.findIndex((item: TableTreeParent) => item.title === tableName) === -1
          if (isNewTable) {
            refreshTables()
          }
        } else {
          // ALTER TABLE
          const tableNodeData = originTablesTree.value.find((item: TableTreeParent) => item.title === tableName)
          if (tableNodeData) {
            // Silently load more
            await loadMoreColumns(tableNodeData, true)
            await loadMoreDetails(tableNodeData, true)
            // Update new children
            originTablesTree.value[tableNodeData.key].children =
              originTablesTree.value[tableNodeData.key][tableNodeData.childrenType]
          }
        }
      }
    }
    return res
  }

  const getResultsByType = (types: string[]) => {
    return results.value.filter((item: ResultType) => types.includes(item.type))
  }

  const clearCode = () => {
    codes.value[queryType.value] = ''
  }

  const replaceCode = (code: string) => {
    queryType.value = 'promql'
    codes.value.promql = code
  }
  return {
    getResultsByType,
    runQuery,
    inputFromNewLineToQueryCode,
    replaceCode,
    sqlView,
    promqlView,
    cursorAt,
    queryOptions,
    queryType,
    primaryCodeRunning,
    secondaryCodeRunning,
    codes,
    clearCode,
  }
}
