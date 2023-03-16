import editorAPI from '@/api/editor'
import { Message } from '@arco-design/web-vue'
import { defineStore } from 'pinia'
import { dateTypes } from '@/views/dashboard/modules/data-view/config'
import { keyType, resultsType, resultType } from './types'
import useLogStore from '../log'
import useAppStore from '../app'

const useCodeRunStore = defineStore('codeRun', () => {
  const titleIndex = ref<keyType>({
    sql: -1,
    python: -1,
  })
  const results = ref<resultsType>({
    sql: [] as Array<resultType>,
    python: [] as Array<resultType>,
  })
  const activeTabKey = ref<keyType>({
    sql: 0,
    python: 0,
  })
  const primaryCodeRunning = ref(false)
  const secondaryCodeRunning = ref(false)
  const { codeType } = storeToRefs(useAppStore())

  const currentResult = computed(() => {
    // TODO: What's the best way to set types in computed?
    return (
      results.value[codeType.value].find((item: resultType) => item.key === activeTabKey.value[codeType.value]) || {
        records: {
          rows: [],
          schema: { column_schemas: [] },
        },
        dimensionsAndXName: [],
      }
    )
  })

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

  const runCode = async (codeInfo: string) => {
    try {
      let res: any = {}
      if (codeType.value === 'sql') {
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
            titleIndex.value[codeType.value] += 1
            const oneResult = {
              records: oneRes.records,
              dimensionsAndXName: rowLength === 0 ? [] : getDimensionsAndXName(oneRes.records.schema.column_schemas),
              key: titleIndex.value[codeType.value],
            }
            results.value[codeType.value].push(oneResult)
            activeTabKey.value[codeType.value] = titleIndex.value[codeType.value]
          }
        } else {
          resultInLog.push({
            affectedRows: oneRes.affectedrows,
          })
        }
      })
      const oneLog = {
        type: codeType.value,
        ...res,
        codeInfo,
        result: resultInLog,
      }
      useLogStore().pushLog(oneLog)
    } catch (error: any) {
      const oneLog = {
        type: codeType.value,
        codeInfo,
        ...error,
      }
      useLogStore().pushLog(oneLog)
    }

    primaryCodeRunning.value = false
    secondaryCodeRunning.value = false
  }

  const saveScript = async (name: string, code: string) => {
    try {
      const res: any = await editorAPI.saveScript(name, code)

      Message.success({
        content: 'save success',
        duration: 2 * 1000,
      })
      useLogStore().pushLog({
        type: codeType.value,
        codeInfo: name,
        ...res,
      })
    } catch (error: any) {
      useLogStore().pushLog({
        type: codeType.value,
        ...error,
      })
      throw error
    }
  }

  const setActiveTabKey = (key: number) => {
    activeTabKey.value[codeType.value] = key
  }

  const clearResults = () => {
    results.value[codeType.value] = []
    titleIndex.value[codeType.value] = -1
    activeTabKey.value[codeType.value] = 0
  }

  const removeResult = (key: number) => {
    if (results.value[codeType.value].length === 1) {
      clearResults()
      return
    }
    let deletedTabIndex = results.value[codeType.value].findIndex((item: resultType) => item.key === key)
    if (deletedTabIndex + 1 === results.value[codeType.value].length) {
      deletedTabIndex -= 1
    }
    results.value[codeType.value] = results.value[codeType.value].filter((item: resultType) => item.key !== key)

    activeTabKey.value[codeType.value] = results.value[codeType.value][deletedTabIndex].key
  }

  return {
    primaryCodeRunning,
    secondaryCodeRunning,
    titleIndex,
    results,
    activeTabKey,
    currentResult,
    runCode,
    saveScript,
    setActiveTabKey,
    removeResult,
    clearResults,
  }
})
export default useCodeRunStore
