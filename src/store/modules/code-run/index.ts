import { getSqlResult } from '@/api/editor'
import { Message } from '@arco-design/web-vue'
import { defineStore } from 'pinia'

const useCodeRunStore = defineStore('codeRun', {
  state: () => ({
    usedCode: <any>[],
    runResult: <any>[],
    resultTabIndex: <any>[],
    activeTabKey: <number>0,
    activeTabData: <any>{},
    oneLog: <any>{},
    logArray: <any>[],
  }),

  getters: {
    logListData(state) {
      if (Object.keys(state.oneLog).length !== 0) {
        const log = state.oneLog
        const logInfo = {
          rowCount: log.output[0].records.rows.length,
          executeTime: log.execution_time_ms,
        }
        state.logArray.push(logInfo)
      }
      return state.logArray
    },
  },

  actions: {
    async fetchSqlResult(runCode: any) {
      try {
        const res = await getSqlResult(runCode)
        Message.success({
          content: 'success',
        })
        if (runCode.toLocaleLowerCase().substring(0, 6) === 'select') {
          this.usedCode.push(runCode)
          this.runResult.push(res)
          this.resultTabIndex.push(this.resultTabIndex.length)
          this.activeTabKey = this.resultTabIndex.length - 1
        }
        // todo: can we combine next two logs into one line code?
        this.oneLog = res
      } catch (error) {
        this.oneLog = error
      }
    },
  },
})
export default useCodeRunStore
