import { getSqlResult, postRunScriptName, postScripts } from '@/api/editor'
import { Message } from '@arco-design/web-vue'
import { defineStore } from 'pinia'
import { dateTypes } from '@/views/dashboard/data-explorer/components/data-view/config'
import { resultsType } from './types'
import useLogStore from '../log'
import useAppStore from '../app'

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
    titleIndex: {
      sql: <number>-1,
      python: <number>-1,
    },
    results: {
      sql: [],
      python: [],
    } as resultsType,
    activeTabKey: {
      sql: <number>0,
      python: <number>0,
    },
    codeType: storeToRefs(useAppStore()).codeType,
  }),

  getters: {
    currentResult(state: any) {
      return state.results[state.codeType].find((item: any) => item.key === state.activeTabKey[state.codeType]) || {}
    },
  },

  actions: {
    async fetchSQLResult(sql: string) {
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
              this.activeTabKey.sql = this.titleIndex.sql
            }
          } else {
            resultInLog.push({
              affectedRows: oneRes.affectedrows,
            })
          }
        })

        useLogStore().pushLog({
          runCode: sql,
          ...res,
          result: resultInLog,
        })
      } catch (error: any) {
        useLogStore().pushLog({
          runCode: sql,
          ...error,
        })
      }
    },

    async saveScript(name: string, code: string) {
      try {
        const res: any = await postScripts(name, code)

        Message.success({
          content: 'save success',
        })
        useLogStore().pushLog({
          name,
          ...res,
        })
      } catch (error: any) {
        useLogStore().pushLog({
          ...error,
        })
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
        useLogStore().pushLog({
          name,
          ...res,
          result: resultInLog,
        })
      } catch (error: any) {
        useLogStore().pushLog({
          name,
          ...error,
        })
      }
    },

    setActiveTabKey(key: number) {
      this.activeTabKey[this.codeType] = key
    },

    removeResult(key: number) {
      if (this.results[this.codeType].length === 1) {
        this.clearResults()
        return
      }
      let deletedTabIndex = this.results[this.codeType].findIndex((item: any) => item.key === key)
      if (deletedTabIndex + 1 === this.results[this.codeType].length) {
        deletedTabIndex -= 1
      }
      this.results[this.codeType] = this.results[this.codeType].filter((item: any) => item.key !== key)
      this.activeTabKey[this.codeType] = this.results[this.codeType][deletedTabIndex].key
    },

    clearResults() {
      this.results[this.codeType] = []
      this.titleIndex[this.codeType] = -1
      this.activeTabKey[this.codeType] = 0
    },
  },
})
export default useCodeRunStore
