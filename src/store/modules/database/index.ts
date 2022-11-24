import { fetchOneTable, getFavoriteList, getTables } from '@/api/editor'
import { defineStore } from 'pinia'

const useDataBaseStore = defineStore('dataBase', {
  // state： data
  // 返回对象字面量
  state: () => ({
    columns: <any>[],
    tableData: <any>{},
    count: 0,
    treeData: <any>[],
    childrenList: <any>[],
    favoriteData: <any>[],
    ifTableLoading: <boolean>true,
  }),
  // getters: computed
  getters: {
    tableList(state) {
      const tempArray: any = []
      state.tableData.output[0].records.rows.forEach((item: any) => {
        const node = {
          title: item.join(),
          key: item.join(),
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
        this.ifTableLoading = true
        const res = await getTables()
        this.ifTableLoading = false
        this.tableData = res
      } catch (error) {
        // some error
      }
    },
    async fetchFavoriteData() {
      try {
        const res = await getFavoriteList()
        this.favoriteData = res.dataset
      } catch (error) {
        // some error
      }
    },
    // todo: maybe fetch just one
    async fetchOneTable(node: any) {
      try {
        const res = await fetchOneTable(node)
        this.childrenList = res
      } catch (error) {
        // some error
      }
    },
  },
})
export default useDataBaseStore
