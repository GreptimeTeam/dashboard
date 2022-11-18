import { getFavoriteList, getOneColumn, getSqlResult, getSqlResult2, getTables, getTables2 } from '@/api/editor'
import { defineStore } from 'pinia'

const useCodeRunStore = defineStore('codeRun', {
  // state： data
  state: () => ({
    usedCode: <any>[],
    runResult: <any>[],
    resultTabIndex: <any>[],
    activeTabKey: <number>0,
    activeTabData: <any>{},
  }),
  // getters: computed
  getters: {
    gridData(state) {},
  },
  // actions: methods

  actions: {
    async fetchSqlResult(code: any) {
      try {
        const res = await getSqlResult()
        // todo: if return success
        this.usedCode.push(code)
        this.runResult.push(res)
        this.resultTabIndex.push(this.resultTabIndex.length)
        this.activeTabKey = this.resultTabIndex.length - 1
        // todo: log info into logs.
      } catch (error) {
        // todo: log error into logs.
      }
    },
    async fetchSqlResult2(code: any) {
      try {
        const res = await getSqlResult2()
        // todo: if return success
        this.usedCode.push(code)
        this.runResult.push(res)
        this.resultTabIndex.push(this.resultTabIndex.length)
        this.activeTabKey = this.resultTabIndex.length - 1
        // todo: log info into logs.
      } catch (error) {
        // todo: log error into logs.
      }
    },
  },
})
export default useCodeRunStore
