import { defineStore } from 'pinia'
import useAppStore from '../app'
import { logsType, logType } from './types'

const useLogStore = defineStore('log', {
  state: () => ({
    logs: {
      query: [],
      scripts: [],
    } as logsType,
  }),

  getters: {},

  actions: {
    pushLog(log: logType, routeName: string) {
      this.logs[routeName] = this.logs[routeName].concat([log])
    },
    clearLogs(routeName: string) {
      this.logs[routeName] = []
    },
  },
})
export default useLogStore
