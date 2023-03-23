import { defineStore } from 'pinia'
import useAppStore from '../app'
import { logsType, logType } from './types'

const useLogStore = defineStore('log', {
  state: () => ({
    routeName: storeToRefs(useAppStore()).routeName,
    logs: {
      query: [],
      scripts: [],
      playground: [],
    } as logsType,
  }),

  getters: {},

  actions: {
    pushLog(log: logType) {
      this.logs[this.routeName] = this.logs[this.routeName].concat([log])
    },
    clearLogs() {
      this.logs[this.routeName] = []
    },
  },
})
export default useLogStore
