import editorAPI from '@/api/editor'
import { defineStore } from 'pinia'

const useDataBaseStore = defineStore('dataBase', {
  state: () => ({
    database: storeToRefs(useAppStore()).database,
    tableData: <any>{
      output: [
        {
          records: {
            rows: [],
          },
        },
      ],
    },
    favoriteData: <any>[],
    ifTableLoading: <boolean>true,
    tableKey: 0,
    scriptsData: <any>{
      output: [
        {
          records: {
            rows: [],
          },
        },
      ],
    },
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
    scriptsList(state) {
      const tempArray: any = []
      state.scriptsData.output[0].records.rows.forEach((item: Array<any>) => {
        const node = {
          title: item[1],
          key: item[1],
          code: item[2],
          isLeaf: true,
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
        this.ifTableLoading = true
        const res = await editorAPI.getTables()
        this.ifTableLoading = false
        this.tableData = res
      } catch (error) {
        // some error
      }
    },
    async fetchOneTable(node: any) {
      try {
        const res = await editorAPI.getTableByName(node)
        return res
      } catch (error) {
        return false
      }
    },
    async fetchScriptsTable() {
      try {
        const res = await editorAPI.getScriptsTable(this.database)
        this.scriptsData = res
      } catch (error) {
        // some error
      }
    },
  },
})
export default useDataBaseStore
