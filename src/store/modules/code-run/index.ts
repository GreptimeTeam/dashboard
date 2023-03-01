import editorAPI from '@/api/editor'
import { Message } from '@arco-design/web-vue'
import { defineStore } from 'pinia'
import { dateTypes } from '@/views/dashboard/modules/data-view/config'
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
    async runCode(codeInfo: string) {
      try {
        let res: any = {}
        if (this.codeType === 'sql') {
          res = await editorAPI.getSqlResult(codeInfo)
        } else {
          res = await editorAPI.runScript(codeInfo)
        }

        Message.success({
          content: 'run success',
          duration: 2 * 1000,
        })
        const resultInLog: any = []
        res.output.forEach((oneRes: any) => {
          if ('records' in oneRes) {
            const rowLength = oneRes.records.rows.length
            resultInLog.push({
              records: rowLength,
            })
            if (rowLength >= 0) {
              this.titleIndex[this.codeType] += 1
              const oneResult = {
                records: oneRes.records,
                dimensionsAndXName: rowLength === 0 ? [] : getDimensionsAndXName(oneRes.records.schema.column_schemas),
                key: this.titleIndex[this.codeType],
              }
              this.results[this.codeType].push(oneResult)
              this.activeTabKey[this.codeType] = this.titleIndex[this.codeType]
            }
          } else {
            resultInLog.push({
              affectedRows: oneRes.affectedrows,
            })
          }
        })
        const oneLog = {
          type: this.codeType,
          ...res,
          codeInfo,
          result: resultInLog,
        }
        useLogStore().pushLog(oneLog)
      } catch (error: any) {
        const oneLog = {
          type: this.codeType,
          codeInfo,
          ...error,
        }
        useLogStore().pushLog(oneLog)
      }
    },

    async saveScript(name: string, code: string) {
      try {
        const res: any = await editorAPI.saveScript(name, code)

        Message.success({
          content: 'save success',
          duration: 2 * 1000,
        })
        useLogStore().pushLog({
          type: this.codeType,
          codeInfo: name,
          ...res,
        })
      } catch (error: any) {
        useLogStore().pushLog({
          type: this.codeType,
          ...error,
        })
        throw error
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
