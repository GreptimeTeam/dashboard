import { ref, computed } from 'vue'
import { defineStore } from 'pinia'
import Message from '@arco-design/web-vue/es/message'
import i18n from '@/locale'
import editorAPI from '@/api/editor'
import dayjs from 'dayjs'
import { dateTypes } from '@/views/dashboard/config'
import { AnyObject } from '@/types/global'
import { ResultType } from './types'

const useCodeRunStore = defineStore('codeRun', () => {
  const { promForm } = useQueryCode()

  const results = ref<ResultType[]>([])
  const resultsId = ref(0)

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

  const runCode = async (codeInfo: string, type: string, withoutSave = false) => {
    try {
      let res: any = {}
      let oneResult = null
      res = await API_MAP[type](codeInfo)
      Message.success({
        content: i18n.global.t('dataExplorer.runSuccess'),
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
      if (type === 'promQL') {
        oneLog.promInfo = {
          Start: dayjs.unix(+promForm.value.start).format('YYYY-MM-DD HH:mm:ss'),
          End: dayjs.unix(+promForm.value.end).format('YYYY-MM-DD HH:mm:ss'),
          Step: promForm.value.step,
          Query: codeInfo,
        }
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
      if ('error' in error) {
        return {
          log: oneLog,
        }
      }
      return { error: 'error' }
    }
  }

  const saveScript = async (name: string, code: string, type = 'python') => {
    try {
      const res: any = await editorAPI.saveScript(name, code)
      return {
        type,
        codeInfo: name,
        ...res,
      }
    } catch (error: any) {
      if ('error' in error) {
        throw new Error(JSON.stringify(error))
      } else {
        throw new Error('error')
      }
    }
  }

  const clear = (type: string | string[]) => {
    const types = Array.isArray(type) ? type : [type]
    results.value = results.value.filter((result) => !types.includes(result.type))
  }

  const removeResult = (key: number) => {
    results.value = results.value.filter((item: ResultType) => item.key !== key)
  }

  return {
    results,
    runCode,
    saveScript,
    removeResult,
    clear,
  }
})
export default useCodeRunStore
