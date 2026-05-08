import type { InjectionKey, Ref } from 'vue'
import type { ResultType } from '@/store/modules/code-run/types'
import type { Log } from '@/types/log'
import useQueryCode from '@/hooks/query-code'

export interface QuerySessionState {
  results: Ref<ResultType[]>
  explainResults: Ref<ResultType[]>
  queryLogs: Ref<Log[]>
  appendResults: (newResults: ResultType[]) => void
  appendLog: (log: Log) => void
  clearAll: () => void
  removeResult: (payload: { key: number | string; type: string }) => void
  removeExplainResult: (payload: { key: number | string }) => void
  refreshSingleResult: (result: ResultType) => Promise<void>
  appendExplainResult: (result: ResultType) => void
}

const querySessionKey: InjectionKey<QuerySessionState> = Symbol('query-session')

export function provideQuerySession(): QuerySessionState {
  const { refreshResult } = useQueryCode()
  const results = ref<ResultType[]>([])
  const explainResults = ref<ResultType[]>([])
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
    explainResults.value = []
    queryLogs.value = []
  }

  const removeResult = (payload: { key: number | string; type: string }) => {
    results.value = results.value.filter((item) => item.key !== payload.key || item.type !== payload.type)
  }

  const removeExplainResult = (payload: { key: number | string }) => {
    explainResults.value = explainResults.value.filter((item) => item.key !== payload.key)
  }

  const refreshSingleResult = async (result: ResultType) => {
    const res = await refreshResult(result)
    if (res?.log) appendLog(res.log)
    if (res?.updatedResult) {
      const indexInResults = results.value.findIndex((item) => item.key === result.key && item.type === result.type)
      if (indexInResults >= 0) {
        results.value[indexInResults] = res.updatedResult
        return
      }

      const indexInExplain = explainResults.value.findIndex((item) => item.key === result.key)
      if (indexInExplain >= 0) {
        explainResults.value[indexInExplain] = res.updatedResult
      }
    }
  }

  const appendExplainResult = (result: ResultType) => {
    explainResults.value.push(result)
  }

  const session: QuerySessionState = {
    results,
    explainResults,
    queryLogs,
    appendResults,
    appendLog,
    clearAll,
    removeResult,
    removeExplainResult,
    refreshSingleResult,
    appendExplainResult,
  }

  provide(querySessionKey, session)
  return session
}

export function useQuerySession(): QuerySessionState {
  const session = inject(querySessionKey, null)
  if (!session) throw new Error('Query session is not provided')
  return session
}
