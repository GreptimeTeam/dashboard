import type { InjectionKey, Ref } from 'vue'
import type { ResultType } from '@/store/modules/code-run/types'
import type { Log } from '@/types/log'
import useQueryCode from '@/hooks/query-code'

export interface QuerySessionState {
  results: Ref<ResultType[]>
  explainResult: Ref<ResultType | null>
  queryLogs: Ref<Log[]>
  appendResults: (newResults: ResultType[]) => void
  appendLog: (log: Log) => void
  clearAll: () => void
  removeResult: (payload: { key: number | string; type: string }) => void
  refreshSingleResult: (result: ResultType) => Promise<void>
  setExplainResult: (result: ResultType | null) => void
}

const querySessionKey: InjectionKey<QuerySessionState> = Symbol('query-session')

export function provideQuerySession(): QuerySessionState {
  const { refreshResult } = useQueryCode()
  const results = ref<ResultType[]>([])
  const explainResult = ref<ResultType | null>(null)
  const queryLogs = ref<Log[]>([])

  const appendResults = (newResults: ResultType[]) => {
    if (!newResults?.length) return
    results.value.push(...newResults)
  }

  const appendLog = (log: Log) => {
    queryLogs.value.push(log)
  }

  const clearAll = () => {
    results.value = []
    explainResult.value = null
    queryLogs.value = []
  }

  const removeResult = (payload: { key: number | string; type: string }) => {
    results.value = results.value.filter((item) => item.key !== payload.key || item.type !== payload.type)
  }

  const refreshSingleResult = async (result: ResultType) => {
    const res = await refreshResult(result)
    if (res?.log) appendLog(res.log)
    if (res?.updatedResult) {
      const index = results.value.findIndex((item) => item.key === result.key && item.type === result.type)
      if (index >= 0) results.value[index] = res.updatedResult
    }
  }

  const setExplainResult = (result: ResultType | null) => {
    explainResult.value = result
  }

  const session: QuerySessionState = {
    results,
    explainResult,
    queryLogs,
    appendResults,
    appendLog,
    clearAll,
    removeResult,
    refreshSingleResult,
    setExplainResult,
  }

  provide(querySessionKey, session)
  return session
}

export function useQuerySession(): QuerySessionState {
  const session = inject(querySessionKey, null)
  if (!session) throw new Error('Query session is not provided')
  return session
}
