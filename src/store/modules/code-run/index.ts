import { getSqlResult } from '@/api/editor'
import { Message } from '@arco-design/web-vue'
import { defineStore } from 'pinia'

// TODO: Add all the types we decide instead of ECharts if needed in the future.
// const TYPE_MAP: any = {
//   Timestamp: 'time',
//   String: 'ordinal',
//   Float64: 'float',
//   Int: 'int',
// }

const getDimensionsAndXName = (elements: any) => {
  const tempDimensions: any = []
  let xAxisName = ''
  let findTimeFlag = false
  elements.forEach((element: any) => {
    if (!findTimeFlag && element.data_type === 'Timestamp') {
      findTimeFlag = true
      xAxisName = element.name
    }
    const oneDimension = {
      name: element.name,
      // Note: let ECharts decide type for now.
      // type: TYPE_MAP[element.data_type] || 'ordinal',
    }

    tempDimensions.push(oneDimension)
  })
  return [tempDimensions, xAxisName]
}

const useCodeRunStore = defineStore('codeRun', {
  state: () => ({
    titleIndex: <number>-1,
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
      return state.results.find((item: any) => item.key === state.activeTabKey) || {}
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
          this.titleIndex += 1
          this.results.push({
            // TODO: multiple results
            ...res.output[0].records,
            dimensionsAndXName: getDimensionsAndXName(res.output[0].records.schema.column_schemas),
            key: this.titleIndex,
            code: runCode,
          })
          this.activeTabKey = this.titleIndex
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

    setActiveTabKey(key: number) {
      this.activeTabKey = key
    },

    removeResult(key: number) {
      if (this.results.length === 1) {
        this.$reset()
        return
      }
      let deletedTabIndex = this.results.findIndex((item: any) => item.key === key)
      if (deletedTabIndex + 1 === this.results.length) {
        deletedTabIndex -= 1
      }
      this.results = this.results.filter((item: any) => item.key !== key)
      this.activeTabKey = this.results[deletedTabIndex].key
    },
  },
})
export default useCodeRunStore
