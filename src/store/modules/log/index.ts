import { defineStore } from 'pinia'

const useLogStore = defineStore('log', {
  state: () => ({
    logs: <any>[],
  }),

  getters: {},

  actions: {
    pushLog(log: any) {
      this.logs.push(log)
    },
    clearLogs() {
      this.logs = []
    },
  },
})
export default useLogStore
