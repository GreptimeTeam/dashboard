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
import { Log, ResultInLog } from '@/types/log'
import { ResultType, DimensionType, SchemaType, PromForm } from '@/store/modules/code-run/types'

const resultKeyCount = reactive<{ [key: string]: number }>({})
const explainResultKeyCount = ref(0)
const refreshCounter = ref(0)

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

const getDimensionsAndXName = (schemas: SchemaType[]) => {
  const dimensions: Array<DimensionType> = []
  let xAxis = ''
  let findTimeFlag = false
  schemas.forEach((schema: SchemaType) => {
    if (!findTimeFlag && dateTypes.find((type: string) => type === schema.data_type)) {
      findTimeFlag = true
      xAxis = schema.name
    }
    dimensions.push({ name: schema.name })
  })
  return { dimensions, xAxis }
}

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
    executionTime: 0,
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
    .map((result: ResultInLog) =>
      i18n.global.tc(`dashboard.${result.type}`, result.rowCount, { rowCount: result.rowCount })
    )
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

export const getExplainResultKeyCount = () => explainResultKeyCount

export const runCode = async (
  codeInfo: string,
  type: string,
  withoutSave = false,
  params = {} as PromForm,
  resultType = 'result'
) => {
  try {
    const queries = type === 'sql' ? parseSqlStatements(codeInfo).map((stmt) => stmt.text) : [codeInfo]
    const createdResults: ResultType[] = []
    let oneResult = {} as ResultType
    const res: HttpResponse = await API_MAP[type](codeInfo, params)
    const resultsInLog: Array<ResultInLog> = []

    res.output.forEach((oneRes: OutputType, indexInOutput: number) => {
      if (Reflect.has(oneRes, 'records')) {
        const rowLength = oneRes.records.rows.length
        resultsInLog.push({ type: 'select', rowCount: rowLength })
        const correspondingQuery = queries[indexInOutput] || codeInfo
        oneResult = createResultFromOutput(oneRes, correspondingQuery, type, resultType)
        oneResult.executionTime = res.execution_time_ms
        if (!withoutSave) createdResults.push(oneResult)
      }
      if (Reflect.has(oneRes, 'affectedrows')) {
        resultsInLog.push({ type: 'affect', rowCount: oneRes.affectedrows })
      }
    })

    if (resultType !== 'explain') {
      Message.success({
        content: resultsInLog
          .map((result: ResultInLog) =>
            i18n.global.tc(`dashboard.${result.type}`, result.rowCount, { rowCount: result.rowCount })
          )
          .join(`;\n`),
        duration: 2 * 1000,
      })
    }

    const log = createLogFromResponse(res, codeInfo, type, params, resultsInLog)
    return { log, results: createdResults, lastResult: oneResult }
  } catch (error: any) {
    const log: Log = { type, codeInfo, ...error }
    if (isObject(error) && Reflect.has(error, 'error')) return { log, error: 'error' }
    return { error: 'error' }
  }
}

export const refreshResult = async (query: string, key: number | string, type: string, params = {} as PromForm) => {
  try {
    const res: HttpResponse = await API_MAP[type](query, params)
    if (res.output && res.output.length > 0 && Reflect.has(res.output[0], 'records')) {
      const updatedResult = createResultFromOutput(res.output[0], query, type, 'result', key)
      updatedResult.executionTime = res.execution_time_ms
      refreshCounter.value += 1
      updatedResult.refreshCount = refreshCounter.value
      const rowLength = res.output[0].records.rows.length
      const log = createLogFromResponse(res, query, type, params, [{ type: 'select', rowCount: rowLength }])
      Message.success({ content: log.message, duration: 2 * 1000 })
      return { log, updatedResult }
    }
    const log = createLogFromResponse(res, query, type, params, [])
    return { log }
  } catch (error: any) {
    const log: Log = { type, codeInfo: query, ...error }
    if (isObject(error) && Reflect.has(error, 'error')) return { log, error: 'error' }
    return { error: 'error' }
  }
}

export const saveScript = async (name: string, code: string, type = 'python') => {
  try {
    const res: any = await editorAPI.saveScript(name, code)
    return { type, codeInfo: name, ...res }
  } catch (error: any) {
    if (isObject(error) && Reflect.has(error, 'error')) throw new Error(JSON.stringify(error))
    throw new Error('error')
  }
}

export const writeInfluxDB = async (data: string, precision: string) => {
  try {
    return await editorAPI.writeInfluxDB(data, precision)
  } catch (error: any) {
    return error
  }
}

export const processLogs = async (
  data: string,
  database: string,
  table: string,
  pipeline: string,
  contentType: string
) => {
  try {
    return await postPipelineLogs(database, table, pipeline, data, contentType)
  } catch (error: any) {
    return error
  }
}

export const runWithFormat = async (code: string, queryType: string, promForm?: PromForm, format?: string) => {
  return queryType === 'sql' ? editorAPI.runSQLWithCSV(code, format) : editorAPI.runPromQL(code, promForm, format)
}
