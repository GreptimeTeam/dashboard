import { useCodeRunStore } from '@/store'
import { ResultType, PromForm } from '@/store/modules/code-run/types'
import { TableTreeParent } from '@/store/modules/database/types'
import { EditorSelection } from '@codemirror/state'
import { sqlFormatter } from '@/utils/sql'
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

    let lastChild
    if (state.doc.children) {
      lastChild = state.doc.children[state.doc.children.length - 1]
    }
    const lastLineCode = state.doc.children
      ? state.doc.children[state.doc.children.length - 1].text[lastChild.text.length - 1]
      : state.doc.text[state.doc.text.length - 1]
    const changes = {
      from: state.doc.length,
      insert: `${lastLineCode.trim() === '' ? '' : '\n'}${code}`,
    }
    const cursorPosition = state.doc.length + code.length + (lastLineCode.trim() === '' ? 0 : 1) - cursorBack
    sqlView.value.focus()
    sqlView.value.dispatch({
      changes,
      selection: EditorSelection.create([EditorSelection.cursor(cursorPosition)]),
      scrollIntoView: true,
    })
  }

  // Parse SQL command to extract operation details
  const parseSqlCommand = (sql: string) => {
    const regex =
      /\bSHOW\s+CREATE\s+TABLE\b|(?:CREATE|DROP|ALTER)\s+(DATABASE|TABLE)\s+(?:IF\s+(?:NOT\s+)?EXISTS\s+)?[`"]?([\w.-]+)[`"]?/gi

    // Reset regex state to ensure proper matching
    regex.lastIndex = 0
    const match = regex.exec(sql)

    // Return immediately after finding the first match
    if (match && match[1]) {
      // Extract action from the full match
      const fullMatch = match[0]
      const action = fullMatch.split(/\s+/)[0].toUpperCase() // First word is the action
      return {
        action,
        object: match[1].toUpperCase(),
        name: match[2],
      }
    }

    return null
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
      const command = parseSqlCommand(sql)

      if (command) {
        const { refreshTables, loadMoreColumns } = useSiderTabs()
        const { originTablesTree } = storeToRefs(useDataBaseStore())
        const { fetchDatabases } = useAppStore()

        const commandType = `${command.action}_${command.object}`

        switch (commandType) {
          case 'CREATE_DATABASE':
          case 'DROP_DATABASE':
            await fetchDatabases()
            break
          case 'CREATE_TABLE':
          case 'DROP_TABLE':
            refreshTables()
            break
          case 'ALTER_TABLE': {
            const tableNodeData = originTablesTree.value.find((item: TableTreeParent) => item.title === command.name)
            if (tableNodeData) {
              await loadMoreColumns(tableNodeData, true)
              // Update new children
              originTablesTree.value[tableNodeData.key].children =
                originTablesTree.value[tableNodeData.key][tableNodeData.childrenType]
            }
            break
          }
          default:
            break
        }
      }
    }
    return res
  }

  const explainQuery = async (code: string, type: string) => {
    const { runCode } = useCodeRunStore()
    const result = await runCode(code, type, false, {} as PromForm, 'explain')
    return result
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

  const exportWithFormat = async (code: string, promForm?: PromForm, format?: string) => {
    try {
      const { runWithFormat } = useCodeRunStore()
      const res = await runWithFormat(code, queryType.value, promForm, format)
      return res
    } catch (error) {
      const enhancedError = error instanceof Error ? error : new Error(`Export failed`)
      throw enhancedError
    }
  }

  const refreshResult = async (key: number | string, type: string, params: PromForm = {} as PromForm) => {
    const { pushLog } = useLog()
    const { refreshResult: storeRefreshResult } = useCodeRunStore()

    const res = await storeRefreshResult(key, type, params)
    if (res.log) {
      pushLog(res.log, type)
    }
    return res
  }

  return {
    getResultsByType,
    runQuery,
    inputFromNewLineToQueryCode,
    replaceCode,
    explainQuery,
    refreshResult,
    sqlView,
    promqlView,
    cursorAt,
    queryOptions,
    queryType,
    primaryCodeRunning,
    secondaryCodeRunning,
    codes,
    clearCode,
    exportWithFormat,
  }
}
