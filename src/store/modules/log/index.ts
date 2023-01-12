import { defineStore } from 'pinia'
import useAppStore from '../app'
import { logsType, logType } from './types'

const useLogStore = defineStore('log', {
  state: () => ({
    codeType: storeToRefs(useAppStore()).codeType,
    logs: {
      sql: [],
      python: [],
    } as logsType,
  }),

  getters: {},

  actions: {
    pushLog(log: logType) {
      this.logs[this.codeType] = this.logs[this.codeType].concat([log])
    },
    clearLogs() {
      this.logs[this.codeType] = []
    },
  },
})
export default useLogStore
