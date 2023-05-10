import { ref, computed } from 'vue'
import { defineStore } from 'pinia'
import Message from '@arco-design/web-vue/es/message'
import i18n from '@/locale'
import editorAPI from '@/api/editor'
import dayjs from 'dayjs'
import { dateTypes } from '@/views/dashboard/config'
import { AnyObject } from '@/types/global'
import { HttpResponse, OutputType } from '@/api/interceptor'
import { ResultType, DimensionType, SchemaType } from './types'
import { Log, ResultInLog } from '../log/types'

const useCodeRunStore = defineStore('codeRun', () => {
  const { promForm } = useQueryCode()

  const results = ref<ResultType[]>([])
  const resultKeyCount = reactive<{ [key: string]: number }>({})

  // TODO: Add all the types we decide instead of ECharts if needed in the future.
  const getDimensionsAndXName = (schemas: SchemaType[]) => {
    const dimensions: Array<DimensionType> = []
    let xAxis = ''
    let findTimeFlag = false
    schemas.forEach((schema: SchemaType) => {
      if (!findTimeFlag && dateTypes.find((type: string) => type === schema.data_type)) {
        findTimeFlag = true
        xAxis = schema.name
      }
      const oneDimension = {
        name: schema.name,
        // Note: let ECharts decide type for now.
      }

      dimensions.push(oneDimension)
    })
    return { dimensions, xAxis }
  }

  const API_MAP: AnyObject = {
    sql: editorAPI.runSQL,
    python: editorAPI.runScript,
    promQL: editorAPI.runPromQL,
  }

  const runCode = async (codeInfo: string, type: string, withoutSave = false) => {
    try {
      // TODO: try something better
      let oneResult = {} as ResultType
      const res: HttpResponse = await API_MAP[type](codeInfo)
      Message.success({
        content: i18n.global.t('dataExplorer.runSuccess'),
        duration: 2 * 1000,
      })
      const resultsInLog: Array<ResultInLog> = []
      res.output.forEach((oneRes: OutputType) => {
        if (Reflect.has(oneRes, 'records')) {
          const rowLength = oneRes.records.rows.length
          resultsInLog.push({
            records: rowLength,
          })
          if (rowLength >= 0) {
            if (Reflect.has(resultKeyCount, type)) {
              resultKeyCount[type] += 1
            } else {
              resultKeyCount[type] = 0
            }

            oneResult = {
              records: oneRes.records,
              dimensionsAndXName:
                rowLength === 0
                  ? { dimensions: [], xAxis: '' }
                  : getDimensionsAndXName(oneRes.records.schema.column_schemas),
              key: resultKeyCount[type],
              type,
            }
            if (!withoutSave) {
              results.value.push(oneResult)
            }
          }
        }
        if (Reflect.has(oneRes, 'affectedrows')) {
          resultsInLog.push({
            affectedRows: oneRes.affectedrows,
          })
        }
      })
      const oneLog: Log = {
        type,
        ...res,
        codeInfo,
        results: resultsInLog,
      }
      if (type === 'promQL') {
        oneLog.promInfo = {
          Start: dayjs.unix(+promForm.value.start).format('YYYY-MM-DD HH:mm:ss'),
          End: dayjs.unix(+promForm.value.end).format('YYYY-MM-DD HH:mm:ss'),
          Step: promForm.value.step,
          Query: codeInfo,
        }
      }
      // TODO: try something better
      return {
        log: oneLog,
        lastResult: oneResult,
      }
    } catch (error: any) {
      const oneLog = {
        type,
        codeInfo,
        ...error,
      }
      if (Reflect.has(error, 'error')) {
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
      if (Reflect.has(error, 'error')) {
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

  const removeResult = (key: number, type: string) => {
    results.value = results.value.filter((item: ResultType) => item.key !== key || item.type !== type)
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
