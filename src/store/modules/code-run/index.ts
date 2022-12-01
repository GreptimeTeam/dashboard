import { getSqlResult } from '@/api/editor'
import { Message } from '@arco-design/web-vue'
import { defineStore } from 'pinia'

const TYPE_MAP: any = {
  Timestamp: 'time',
  String: 'ordinal',
  Float64: 'float',
  Int: 'int',
}

const getDimensions = (elements: any) =>
  elements.map((element: any) => {
    return {
      name: element.name,
      type: TYPE_MAP[element.data_type] || 'ordinal',
    }
  })

const useCodeRunStore = defineStore('codeRun', {
  state: () => ({
    resultIndex: <number>-1,
    results: <any>[],
    activeTabKey: <number>0,
    oneLog: <any>{},
    logArray: <any>[],
  }),

  getters: {
    logListData(state) {
      if (Object.keys(state.oneLog).length !== 0) {
        const { log, code } = state.oneLog
        const logInfo: any = {
          runCode: code,
          executeTime: log.execution_time_ms,
        }
        if (!log.error) {
          if (!log.output[0].affectedrows) {
            logInfo.resultRows = log.output[0].records.rows.length
          } else {
            logInfo.affectedRows = log.output[0].affectedrows
          }
        } else {
          logInfo.error = log.error
        }
        state.logArray.push(logInfo)
      }
      return state.logArray
    },
    currentResult(state) {
      return state.results[state.activeTabKey] || {}
    },
  },

  actions: {
    async fetchSqlResult(runCode: any) {
      try {
        const res: any = await getSqlResult(runCode)
        Message.success({
          content: 'success',
        })
        if (runCode.toLocaleLowerCase().substring(0, 6) === 'select') {
          this.resultIndex += 1
          this.results.push({
            // TODO: multiple results
            ...res.output[0].records,
            dimensions: getDimensions(res.output[0].records.schema.column_schemas),
            index: this.resultIndex,
            code: runCode,
          })
          this.activeTabKey = this.results.length - 1
        }
        // todo: can we combine next two logs into one line code?
        this.oneLog = {
          log: res,
          code: runCode,
        }
      } catch (error) {
        this.oneLog = {
          log: error,
        }
      }
    },

    setActiveTabKey(index: number) {
      this.activeTabKey = index
    },

    removeResult(index: number) {
      if (this.results.length === 1) {
        this.clearResult()
        return
      }
      const indexToRemove = this.results.findIndex((item: any) => item.index === index)
      this.results.splice(indexToRemove, 1)
      if (index === this.activeTabKey) {
        this.activeTabKey = this.results[indexToRemove].index
      }
    },

    // TODO: use reset function
    clearResult() {
      this.results = []
      this.resultIndex = -1
      this.activeTabKey = 0
    },
  },
})
export default useCodeRunStore
