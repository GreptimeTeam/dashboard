import { getFavoriteList, getOneColumn, getSqlResult, getTables, getTables2 } from '@/api/editor'
import { defineStore } from 'pinia'
import useDataExplorer from '@/hooks/data-explorer'

const useCodeRunStore = defineStore('codeRun', {
  // state： data
  state: () => ({
    usedCode: <any>[],
    runResult: <any>[],
    resultTabIndex: <any>[],
    activeTabKey: 0,
  }),
  // getters: computed
  getters: {
    dataSource(state) {},
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
  },
})
export default useCodeRunStore
