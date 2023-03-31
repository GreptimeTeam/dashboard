import { ref, computed } from 'vue'
import { storeToRefs, defineStore } from 'pinia'
import editorAPI from '@/api/editor'
import { Message } from '@arco-design/web-vue'
import { dateTypes } from '@/views/dashboard/modules/data-view/config'
import { AnyObject, NumberObject } from '@/types/global'
import { ResultType } from './types'

const useCodeRunStore = defineStore('codeRun', () => {
  const results = ref<ResultType[]>([])
  const resultsId = ref(0)

  const primaryCodeRunning = ref(false)
  const secondaryCodeRunning = ref(false)
  const route = { name: 'playground' }

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

  const API_MAP: AnyObject = {
    sql: editorAPI.getSqlResult,
    python: editorAPI.runScript,
    promQL: editorAPI.runPromQL,
  }

  const runCode = async (codeInfo: string, type: string, withoutSave = false) => {
    try {
      let res: any = {}
      let oneResult = null
      res = await API_MAP[type](codeInfo)

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
            resultsId.value += 1
            oneResult = {
              records: oneRes.records,
              dimensionsAndXName: rowLength === 0 ? [] : getDimensionsAndXName(oneRes.records.schema.column_schemas),
              key: resultsId.value,
              type,
            }
            if (!withoutSave) {
              results.value.push(oneResult)
            }
          }
        } else {
          resultInLog.push({
            affectedRows: oneRes.affectedrows,
          })
        }
      })
      const oneLog = {
        type,
        ...res,
        codeInfo,
        result: resultInLog,
      }

      return {
        log: oneLog,
        record: oneResult,
      }
    } catch (error: any) {
      const oneLog = {
        type,
        codeInfo,
        ...error,
      }
      return {
        log: oneLog,
      }
    }
  }

  const saveScript = async (name: string, code: string, type = 'python') => {
    try {
      const res: any = await editorAPI.saveScript(name, code)

      Message.success({
        content: 'save success',
        duration: 2 * 1000,
      })
      return {
        type,
        codeInfo: name,
        ...res,
      }
    } catch (error: any) {
      return {
        type,
        ...error,
      }
    }
  }

  const clearResults = (type = '') => {
    results.value = results.value.filter((result) => result.type !== type)
  }

  const removeResult = (key: number) => {
    results.value = results.value.filter((item: ResultType) => item.key !== key)
  }

  return {
    primaryCodeRunning,
    secondaryCodeRunning,
    results,
    runCode,
    saveScript,
    removeResult,
    clearResults,
  }
})
export default useCodeRunStore
