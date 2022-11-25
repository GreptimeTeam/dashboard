import { fetchOneTable, getFavoriteList, getTables } from '@/api/editor'
import { defineStore } from 'pinia'

const useDataBaseStore = defineStore('dataBase', {
  // state： data
  state: () => ({
    tableData: <any>{},
    favoriteData: <any>[],
    ifTableLoading: <boolean>true,
    tableKey: 0,
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
    async fetchOneTable(node: any) {
      try {
        const res = await fetchOneTable(node)
        return res
      } catch (error) {
        return false
      }
    },
  },
})
export default useDataBaseStore
