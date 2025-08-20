import { ref } from 'vue'
import { defineStore } from 'pinia'
import Message from '@arco-design/web-vue/es/message'
import i18n from '@/locale'
import editorAPI from '@/api/editor'
import { postPipelineLogs } from '@/api/pipeline'
import dayjs from 'dayjs'
import { dateTypes } from '@/views/dashboard/config'
import { AnyObject } from '@/types/global'
import { HttpResponse, OutputType } from '@/api/interceptor'
import { isObject } from '@/utils/is'
import { parseSqlStatements } from '@/utils/sql'
import { ResultType, DimensionType, SchemaType, PromForm } from './types'
import { Log, ResultInLog } from '../log/types'

const useCodeRunStore = defineStore('codeRun', () => {
  const results = ref<ResultType[]>([])
  const resultKeyCount = reactive<{ [key: string]: number }>({})
  const explainResult = ref<ResultType>()

  // TODO: Add all the types we decide instead of ECharts if needed in the future.
  // Delete default X name?
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
    sql: (code: string, params: PromForm) => editorAPI.runSQL(code),
    python: editorAPI.runScript,
    promql: editorAPI.runPromQL,
  }

  const CODE_TO_PAGE: { [key: string]: string } = {
    sql: 'query',
    promql: 'query',
    python: 'scripts',
  }

  const explainResultKeyCount = ref(0)
  const refreshCounter = ref(0)

  const createResultFromOutput = (
    output: OutputType,
    query: string,
    type: string,
    resultType: string,
    key?: number | string
  ): ResultType => {
    const rowLength = output.records.rows.length
    const pageType = CODE_TO_PAGE[type]

    let resultKey = key
    if (key === undefined) {
      if (resultType === 'explain') {
        resultKey = `explain-${(explainResultKeyCount.value += 1)}`
      } else {
        if (Reflect.has(resultKeyCount, pageType)) {
          resultKeyCount[pageType] += 1
        } else {
          resultKeyCount[pageType] = 0
        }
        resultKey = resultKeyCount[pageType]
      }
    }

    return {
      records: output.records,
      dimensionsAndXName:
        rowLength === 0 ? { dimensions: [], xAxis: '' } : getDimensionsAndXName(output.records.schema.column_schemas),
      key: resultKey,
      type,
      name: resultType,
      executionTime: 0, // Will be set by the caller
      query,
    }
  }

  const createLogFromResponse = (
    res: HttpResponse,
    codeInfo: string,
    type: string,
    params: PromForm,
    resultsInLog: Array<ResultInLog>
  ): Log => {
    const message = resultsInLog
      .map((result: ResultInLog) => {
        return i18n.global.tc(`dashboard.${result.type}`, result.rowCount, { rowCount: result.rowCount })
      })
      .join(`;\n`)

    const log: Log = {
      type,
      ...res,
      codeInfo,
      message,
      codeTooltip: codeInfo,
    }

    if (type === 'promql') {
      let start
      let end

      if (params.time !== 0) {
        const now = dayjs()
        end = now.unix()
        start = now.subtract(params.time, 'minute').unix()
      } else {
        ;[start, end] = params.range
      }
      log.promInfo = {
        Start: dayjs.unix(+start).format('YYYY-MM-DD HH:mm:ss'),
        End: dayjs.unix(+end).format('YYYY-MM-DD HH:mm:ss'),
        Step: params.step,
        Query: codeInfo,
      }
    }

    return log
  }

  const runCode = async (
    codeInfo: string,
    type: string,
    withoutSave = false,
    params = {} as PromForm,
    resultType = 'result'
  ) => {
    try {
      // For SQL, we may have multiple statements separated by semicolon.
      const queries = type === 'sql' ? parseSqlStatements(codeInfo).map((stmt) => stmt.text) : [codeInfo]

      // TODO: try something better
      let oneResult = {} as ResultType
      const res: HttpResponse = await API_MAP[type](codeInfo, params)
      const resultsInLog: Array<ResultInLog> = []

      res.output.forEach((oneRes: OutputType, indexInOutput: number) => {
        if (Reflect.has(oneRes, 'records')) {
          const rowLength = oneRes.records.rows.length
          resultsInLog.push({
            type: 'select',
            rowCount: rowLength,
          })
          if (rowLength >= 0) {
            const correspondingQuery = queries[indexInOutput] || codeInfo

            oneResult = createResultFromOutput(oneRes, correspondingQuery, type, resultType)
            oneResult.executionTime = res.execution_time_ms

            if (!withoutSave) {
              if (resultType === 'explain') {
                explainResult.value = oneResult
              } else {
                results.value.push(oneResult)
              }
            }
          }
        }
        if (Reflect.has(oneRes, 'affectedrows')) {
          resultsInLog.push({
            type: 'affect',
            rowCount: oneRes.affectedrows,
          })
        }
      })

      if (resultType !== 'explain') {
        const message = resultsInLog
          .map((result: ResultInLog) => {
            return i18n.global.tc(`dashboard.${result.type}`, result.rowCount, { rowCount: result.rowCount })
          })
          .join(`;\n`)

        Message.success({
          content: message,
          duration: 2 * 1000,
        })
      }

      const log = createLogFromResponse(res, codeInfo, type, params, resultsInLog)

      return {
        log,
        lastResult: oneResult,
      }
    } catch (error: any) {
      const log: Log = {
        type,
        codeInfo,
        ...error,
      }
      if (isObject(error) && Reflect.has(error, 'error')) {
        return {
          log,
          error: 'error',
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
      if (isObject(error) && Reflect.has(error, 'error')) {
        throw new Error(JSON.stringify(error))
      } else {
        throw new Error('error')
      }
    }
  }

  const clear = (type: string | string[]) => {
    const types = Array.isArray(type) ? type : [type]
    results.value = results.value.filter((result) => !types.includes(result.type))
    explainResult.value = null
  }

  const removeResult = (key: number | string, type: string) => {
    results.value = results.value.filter((item: ResultType) => item.key !== key || item.type !== type)
  }

  const refreshResult = async (key: number | string, type: string, params = {} as PromForm) => {
    const resultIndex = results.value.findIndex((item: ResultType) => item.key === key && item.type === type)
    const targetResult = results.value[resultIndex]

    try {
      const res: HttpResponse = await API_MAP[type](targetResult.query, params)

      if (res.output && res.output.length > 0 && Reflect.has(res.output[0], 'records')) {
        const updatedResult = createResultFromOutput(
          res.output[0],
          targetResult.query,
          type,
          'result',
          targetResult.key
        )
        updatedResult.executionTime = res.execution_time_ms
        refreshCounter.value += 1
        updatedResult.refreshCount = refreshCounter.value

        // replace
        results.value[resultIndex] = updatedResult

        const rowLength = res.output[0].records.rows.length
        const resultsInLog: Array<ResultInLog> = [
          {
            type: 'select',
            rowCount: rowLength,
          },
        ]

        const log = createLogFromResponse(res, targetResult.query, type, params, resultsInLog)

        Message.success({
          content: log.message,
          duration: 2 * 1000,
        })

        return {
          log,
        }
      }

      const log = createLogFromResponse(res, targetResult.query, type, params, [])

      return {
        log,
      }
    } catch (error: any) {
      const log: Log = {
        type,
        codeInfo: targetResult.query,
        ...error,
      }
      if (isObject(error) && Reflect.has(error, 'error')) {
        return {
          log,
          error: 'error',
        }
      }
      return { error: 'error' }
    }
  }

  const writeInfluxDB = async (data: string, precision: string) => {
    try {
      const res: any = await editorAPI.writeInfluxDB(data, precision)
      return res
    } catch (error: any) {
      return error
    }
  }

  const processLogs = async (data: string, table: string, pipeline: string, contentType: string) => {
    try {
      const appStore = useAppStore()
      const res = await postPipelineLogs(appStore.database, table, pipeline, data, contentType)

      return res
    } catch (error: any) {
      return error
    }
  }

  const runWithFormat = async (code: string, queryType: string, promForm?: PromForm, format?: string) => {
    const res: any =
      queryType === 'sql'
        ? await editorAPI.runSQLWithCSV(code, format)
        : await editorAPI.runPromQL(code, promForm, format)
    return res
  }
  return {
    results,
    runCode,
    saveScript,
    removeResult,
    refreshResult,
    clear,
    writeInfluxDB,
    explainResultKeyCount,
    explainResult,
    runWithFormat,
    processLogs,
  }
})
export default useCodeRunStore
