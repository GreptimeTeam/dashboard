import { ref, computed } from 'vue'
import { storeToRefs, defineStore } from 'pinia'
import editorAPI from '@/api/editor'
import { Message } from '@arco-design/web-vue'
import { dateTypes } from '@/views/dashboard/modules/data-view/config'
import { AnyObject, NumberObject } from '@/types/global'
import { ResultType } from './types'

const useCodeRunStore = defineStore('codeRun', () => {
  const titleIndex = ref<NumberObject>({
    query: -1,
    scripts: -1,
    playground: 0,
  })
  const results = ref<ResultType[]>([])

  const activeTabKey = ref<NumberObject>({
    query: 0,
    scripts: 0,
    playground: 0,
  })
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

  const runCode = async (codeInfo: string, type: string) => {
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
            titleIndex.value[route.name] += 1
            oneResult = {
              records: oneRes.records,
              dimensionsAndXName: rowLength === 0 ? [] : getDimensionsAndXName(oneRes.records.schema.column_schemas),
              key: titleIndex.value[route.name],
              type,
            }
            results.value.push(oneResult)
            activeTabKey.value[route.name] = titleIndex.value[route.name]
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

  const setActiveTabKey = (key: number) => {
    activeTabKey.value[route.name] = key
  }

  const clearResults = (type = '') => {
    results.value = results.value.filter((result) => result.type !== type)
    titleIndex.value[route.name] = -1
    activeTabKey.value[route.name] = 0
  }

  const removeResult = (key: number) => {
    if (results.value[route.name].length === 1) {
      clearResults()
      return
    }
    let deletedTabIndex = results.value[route.name].findIndex((item: ResultType) => item.key === key)
    if (deletedTabIndex + 1 === results.value[route.name].length) {
      deletedTabIndex -= 1
    }
    results.value[route.name] = results.value[route.name].filter((item: ResultType) => item.key !== key)

    activeTabKey.value[route.name] = results.value[route.name][deletedTabIndex].key
  }

  return {
    primaryCodeRunning,
    secondaryCodeRunning,
    titleIndex,
    results,
    activeTabKey,
    runCode,
    saveScript,
    setActiveTabKey,
    removeResult,
    clearResults,
  }
})
export default useCodeRunStore
