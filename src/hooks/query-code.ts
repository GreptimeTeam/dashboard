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

  // Debounce timers
  let refreshTablesTimer: ReturnType<typeof setTimeout> | null = null
  let fetchDatabasesTimer: ReturnType<typeof setTimeout> | null = null

  // Parse SQL command to extract operation details
  const parseSqlCommand = (sql: string) => {
    const regex =
      /\bSHOW\s+CREATE\s+TABLE\b|(?:CREATE|DROP|ALTER)\s+(DATABASE|TABLE)\s+(?:IF\s+(?:NOT\s+)?EXISTS\s+)?[`"]?([\w.-]+)[`"]?/gi
    const commands = []

    // Reset regex state to ensure proper matching
    regex.lastIndex = 0
    let match = regex.exec(sql)

    while (match !== null) {
      // Skip SHOW CREATE TABLE matches (they won't have capture groups)
      if (match[1]) {
        // Extract action from the full match
        const fullMatch = match[0]
        const action = fullMatch.split(/\s+/)[0].toUpperCase() // First word is the action
        commands.push({
          action,
          object: match[1].toUpperCase(),
          name: match[2],
        })
      }
      match = regex.exec(sql)
    }

    return commands
  }

  // Debounced refresh functions
  const debouncedRefreshTables = () => {
    if (refreshTablesTimer) {
      clearTimeout(refreshTablesTimer)
    }
    refreshTablesTimer = setTimeout(() => {
      const { refreshTables } = useSiderTabs()
      refreshTables()
    }, 300)
  }

  const debouncedFetchDatabases = () => {
    if (fetchDatabasesTimer) {
      clearTimeout(fetchDatabasesTimer)
    }
    fetchDatabasesTimer = setTimeout(() => {
      const { fetchDatabases } = useAppStore()
      fetchDatabases()
    }, 300)
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
      const commands = parseSqlCommand(sql)

      if (commands.length > 0) {
        const { loadMoreColumns } = useSiderTabs()
        const { originTablesTree } = storeToRefs(useDataBaseStore())

        let needRefreshTables = false
        let needRefreshDatabases = false
        const alterTableTasks: Promise<void>[] = []

        // Process commands using forEach
        commands.forEach((cmd) => {
          const commandType = `${cmd.action}_${cmd.object}`

          switch (commandType) {
            case 'CREATE_DATABASE':
            case 'DROP_DATABASE':
              needRefreshDatabases = true
              break
            case 'CREATE_TABLE':
            case 'DROP_TABLE':
              needRefreshTables = true
              break
            case 'ALTER_TABLE': {
              const tableNodeData = originTablesTree.value.find((item: TableTreeParent) => item.title === cmd.name)
              if (tableNodeData) {
                // Collect async tasks to be executed later
                const task = Promise.resolve().then(async () => {
                  await loadMoreColumns(tableNodeData, true)
                  // Update new children
                  originTablesTree.value[tableNodeData.key].children =
                    originTablesTree.value[tableNodeData.key][tableNodeData.childrenType]
                })
                alterTableTasks.push(task)
              }
              break
            }
            default:
              break
          }
        })

        // Execute all ALTER TABLE tasks in parallel
        if (alterTableTasks.length > 0) {
          await Promise.all(alterTableTasks)
        }

        // Apply debounced refreshes
        if (needRefreshDatabases) {
          debouncedFetchDatabases()
        }
        if (needRefreshTables) {
          debouncedRefreshTables()
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

  onBeforeUnmount(() => {
    if (refreshTablesTimer) {
      clearTimeout(refreshTablesTimer)
    }
    if (fetchDatabasesTimer) {
      clearTimeout(fetchDatabasesTimer)
    }
  })

  return {
    getResultsByType,
    runQuery,
    inputFromNewLineToQueryCode,
    replaceCode,
    explainQuery,
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
