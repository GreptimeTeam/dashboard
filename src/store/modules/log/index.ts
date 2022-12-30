import { defineStore } from 'pinia'

const useLogStore = defineStore('log', {
  state: () => ({
    logs: <any>[],
    scriptLogs: <any>[],
  }),

  getters: {},

  actions: {
    pushLog(log: any) {
      this.logs.push(log)
    },
    clearLogs() {
      this.logs = []
    },
    pushScriptLog(log: any) {
      this.scriptLogs.push(log)
    },
    clearScriptLogs() {
      this.scriptLogs = []
    },
  },
})
export default useLogStore
