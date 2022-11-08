import { getOneColumn, getTables, getTables2 } from '@/api/editor'
import { defineStore } from 'pinia'
import { tableState } from './types'
import { treeState } from './types'

const useDataBaseStore = defineStore('dataBase', {
  // state： data
  // 返回对象字面量
  state: () => ({
    columns: <any>[],
    tableList: <any>[],
    count: 0,
    treeData: <any>[],
  }),
  // getters: computed
  getters: {
    tableResult(state: tableState): tableState {
      return state
    },
    makeTableList() {
      const tempArray: any = []
      this.tableList.forEach((item: any) => {
        const node = {
          title: item[1],
          key: item[1],
        }
        tempArray.push(node)
      })
      return tempArray
    },
  },
  // actions: methods
  actions: {
    async fetchDataBaseTables() {
      try {
        const res = await getTables()
        this.tableList = res.dataset
      } catch (error) {
        // some error
      }
    },
    async fetchOneColumn(id: any) {
      try {
        const res = await getOneColumn(id)
      } catch (error) {
        // some error
      }
    },
    async refreshDataBaseTables() {
      try {
        const res = await getTables2()
        this.tableList = res.dataset
      } catch (error) {
        // some error
      }
    },
  },
})
export default useDataBaseStore
