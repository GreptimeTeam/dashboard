import { getOneColumn, getTables, getTables2 } from '@/api/editor'
import { defineStore } from 'pinia'
import { tableState } from './types'
import { treeState } from './types'

const useDataBaseStore = defineStore('dataBase', {
  // state： data
  // 返回对象字面量
  state: () => ({
    columns: <any>[],
    tableData: <any>[],
    count: 0,
    treeData: <any>[],
    childrenList: <any>[],
    favoriteData: <any>[],
  }),
  // getters: computed
  getters: {
    tableList(state) {
      const tempArray: any = []
      state.tableData.forEach((item: any) => {
        const node = {
          title: item[1],
          key: item[1],
          isLeaf: false,
        }
        tempArray.push(node)
      })

      return tempArray
    },
    favoriteList(state) {
      const tempArray: any = []
      state.favoriteData.forEach((item: any) => {
        const one = {
          title: item[1],
          key: item[1],
        }
        tempArray.push(one)
      })
      return tempArray
    },
    // todo: maybe make leaf children
    makeTableChildren() {
      return [{ title: `leaf`, key: `-1`, isLeaf: true }]
    },
  },
  // actions: methods
  actions: {
    async fetchDataBaseTables() {
      try {
        const res = await getTables()
        this.tableData = res.dataset
      } catch (error) {
        // some error
      }
    },
    async fetchFavoriteData() {
      try {
        const res = await getTables()
        this.favoriteData = res.dataset
      } catch (error) {
        // some error
      }
    },
    // todo: maybe fetch just one
    async fetchOneColumn(node: any) {
      try {
        const res = await getOneColumn(node)
        this.childrenList = res.dataset
      } catch (error) {
        // some error
      }
    },
    async refreshDataBaseTables() {
      try {
        const res = await getTables2()
        this.tableData = res.dataset
      } catch (error) {
        // some error
      }
    },
  },
})
export default useDataBaseStore
