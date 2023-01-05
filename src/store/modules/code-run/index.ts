import { getSqlResult, postRunScriptName, postScripts } from '@/api/editor'
import { Message } from '@arco-design/web-vue'
import { defineStore } from 'pinia'
import { dateTypes } from '@/views/dashboard/data-explorer/components/data-view/config'

// TODO: Add all the types we decide instead of ECharts if needed in the future.

const getDimensionsAndXName = (elements: any) => {
  const tempDimensions: any = []
  let xAxisName = ''
  let findTimeFlag = false
  elements.forEach((element: any) => {
    if (!findTimeFlag && dateTypes.find((type: string) => type === element.data_type)) {
      findTimeFlag = true
      xAxisName = element.name
    }
    const oneDimension = {
      name: element.name,
      // Note: let ECharts decide type for now.
    }

    tempDimensions.push(oneDimension)
  })
  return [tempDimensions, xAxisName]
}

const useCodeRunStore = defineStore('codeRun', {
  state: () => ({
    codeType: <string>'sql',
    titleIndex: {
      sql: <number>-1,
      python: <number>-1,
    },
    results: {
      sql: [],
      python: [],
    },
    activeTabKey: {
      sql: <number>0,
      python: <number>0,
    },
  }),

  getters: {
    currentResult(state: any) {
      return state.results[state.codeType].find((item: any) => item.key === state.activeTabKey[state.codeType]) || {}
    },
  },

  actions: {
    async fetchSQLResult(sql: string) {
      const { pushLog } = useLogStore()
      try {
        const res: any = await getSqlResult(sql)

        Message.success({
          content: 'success',
        })
        const resultInLog: any = []
        res.output.forEach((oneRes: any) => {
          if ('records' in oneRes) {
            resultInLog.push({
              records: oneRes.records.rows.length,
            })
            if (oneRes.records.rows.length > 0) {
              this.titleIndex.sql += 1
              this.results.sql.push({
                records: oneRes.records,
                dimensionsAndXName: getDimensionsAndXName(oneRes.records.schema.column_schemas),
                key: this.titleIndex.sql,
              })
              console.log(this.results)
              this.activeTabKey.sql = this.titleIndex.sql
            }
          } else {
            resultInLog.push({
              affectedRows: oneRes.affectedrows,
            })
          }
        })

        pushLog({
          sql,
          ...res,
          result: resultInLog,
        })
      } catch (error: any) {
        pushLog({
          sql,
          ...error,
        })
      }
    },

    async saveScript(name: string, code: any) {
      try {
        const res: any = await postScripts(name, code)

        Message.success({
          content: 'save success',
        })
        const resultInLog: any = []
      } catch (error: any) {
        // error
      }
    },

    async runScript(name: string) {
      try {
        const res: any = await postRunScriptName(name)
        Message.success({
          content: 'run success',
        })
        const resultInLog: any = []
        res.output.forEach((oneRes: any) => {
          resultInLog.push({
            records: oneRes.records.rows.length,
          })
          if (oneRes.records.rows.length > 0) {
            this.titleIndex.python += 1
            this.results.python.push({
              records: oneRes.records,
              dimensionsAndXName: getDimensionsAndXName(oneRes.records.schema.column_schemas),
              key: this.titleIndex.python,
            })
            this.activeTabKey.python = this.titleIndex.python
          }
        })
      } catch (error: any) {
        // error
      }
    },

    setActiveTabKey(key: number) {
      this.activeTabKey[this.codeType] = key
    },

    // TODO: change remove result
    removeResult(key: number) {
      if (this.results.length === 1) {
        this.$reset()
        return
      }
      let deletedTabIndex = this.results.findIndex((item: any) => item.key === key)
      if (deletedTabIndex + 1 === this.results.length) {
        deletedTabIndex -= 1
      }
      this.results = this.results.filter((item: any) => item.key !== key)
      this.activeTabKey = this.results[deletedTabIndex].key
    },

    // TODO: change clear result
    clearResult() {
      this.$reset()
    },
  },
})
export default useCodeRunStore
