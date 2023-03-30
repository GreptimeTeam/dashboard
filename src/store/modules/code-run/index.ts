import editorAPI from '@/api/editor'
import { useI18n } from 'vue-i18n'
import { Message } from '@arco-design/web-vue'
import { defineStore } from 'pinia'
import { dateTypes } from '@/views/dashboard/modules/data-view/config'
import { AnyObject, NumberObject } from '@/types/global'
import { ResultsType, ResultType } from './types'
import useLogStore from '../log'
import useAppStore from '../app'

const useCodeRunStore = defineStore('codeRun', () => {
  const titleIndex = ref<NumberObject>({
    query: -1,
    scripts: -1,
  })
  const results = ref<ResultsType>({
    query: [] as Array<ResultType>,
    scripts: [] as Array<ResultType>,
  })
  const activeTabKey = ref<NumberObject>({
    query: 0,
    scripts: 0,
  })
  const primaryCodeRunning = ref(false)
  const secondaryCodeRunning = ref(false)
  const { codeType } = storeToRefs(useAppStore())
  const i18 = useI18n()
  const route = useRoute()

  const currentResult = computed(() => {
    const defaultValue = {
      records: {
        rows: [],
        schema: { column_schemas: [] },
      },
      dimensionsAndXName: [],
    }

    const routeName = route.name as string
    const result = results.value[routeName].find((item: ResultType) => item.key === activeTabKey.value[routeName])
    return result || defaultValue
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

  const API_MAP: AnyObject = {
    sql: editorAPI.runSQL,
    python: editorAPI.runScript,
    promQL: editorAPI.runPromQL,
  }

  const runCode = async (codeInfo: string, routeName: string) => {
    try {
      let res: any = {}
      res = await API_MAP[codeType.value](codeInfo)
      Message.success({
        content: i18.t('dataExplorer.runSuccess'),
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
            titleIndex.value[routeName] += 1
            const oneResult = {
              records: oneRes.records,
              dimensionsAndXName: rowLength === 0 ? [] : getDimensionsAndXName(oneRes.records.schema.column_schemas),
              key: titleIndex.value[routeName],
            }
            results.value[routeName].push(oneResult)
            activeTabKey.value[routeName] = titleIndex.value[routeName]
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
      useLogStore().pushLog(oneLog, routeName)
    } catch (error: any) {
      const oneLog = {
        type: codeType.value,
        codeInfo,
        ...error,
      }
      useLogStore().pushLog(oneLog, routeName)
    }

    primaryCodeRunning.value = false
    secondaryCodeRunning.value = false
  }

  const saveScript = async (name: string, code: string, routeName: string) => {
    try {
      const res: any = await editorAPI.saveScript(name, code)

      Message.success({
        content: i18.t('dataExplorer.saveSuccess'),
        duration: 2 * 1000,
      })
      useLogStore().pushLog(
        {
          type: codeType.value,
          codeInfo: name,
          ...res,
        },
        routeName
      )
    } catch (error: any) {
      useLogStore().pushLog(
        {
          type: codeType.value,
          ...error,
        },
        routeName
      )
      throw error
    }
  }

  const setActiveTabKey = (key: number) => {
    const routeName = route.name as string
    activeTabKey.value[routeName] = key
  }

  const clearResults = () => {
    const routeName = route.name as string
    results.value[routeName] = []
    titleIndex.value[routeName] = -1
    activeTabKey.value[routeName] = 0
  }

  const removeResult = (key: number) => {
    const routeName = route.name as string
    if (results.value[routeName].length === 1) {
      clearResults()
      return
    }
    let deletedTabIndex = results.value[routeName].findIndex((item: ResultType) => item.key === key)
    if (deletedTabIndex + 1 === results.value[routeName].length) {
      deletedTabIndex -= 1
    }
    results.value[routeName] = results.value[routeName].filter((item: ResultType) => item.key !== key)

    activeTabKey.value[routeName] = results.value[routeName][deletedTabIndex].key
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
