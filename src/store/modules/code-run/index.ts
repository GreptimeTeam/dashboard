import { ref } from 'vue'
import { defineStore } from 'pinia'
import Message from '@arco-design/web-vue/es/message'
import i18n from '@/locale'
import editorAPI from '@/api/editor'
import dayjs from 'dayjs'
import { dateTypes } from '@/views/dashboard/config'
import { AnyObject } from '@/types/global'
import { HttpResponse, OutputType } from '@/api/interceptor'
import { isObject } from '@/utils/is'
import { ResultType, DimensionType, SchemaType, PromForm } from './types'
import { Log, ResultInLog } from '../log/types'

const useCodeRunStore = defineStore('codeRun', () => {
  const results = ref<ResultType[]>([])
  const resultKeyCount = reactive<{ [key: string]: number }>({})

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

  // Add this function to handle explain result placement
  const manageExplainResult = (newResult: ResultType) => {
    // Check if this is an explain result
    if (newResult.name === 'explain') {
      // Look for an existing explain result
      const existingExplainIndex = results.value.findIndex((result) => result.name === 'explain')

      if (existingExplainIndex >= 0) {
        // Replace existing explain result
        results.value.splice(existingExplainIndex, 1, newResult)
      } else {
        // Add the new explain result at the beginning
        results.value.unshift(newResult)
      }
      return true // Indicate we've handled this result
    }
    return false // Not an explain result
  }

  const exmpleRes: any = {
    output: [
      {
        records: {
          schema: {
            column_schemas: [
              {
                name: 'stage',
                data_type: 'UInt32',
              },
              {
                name: 'node',
                data_type: 'UInt32',
              },
              {
                name: 'plan',
                data_type: 'String',
              },
            ],
          },
          rows: [
            [
              0,
              0,
              '{"name":"ProjectionExec","param":"expr=[date_bin(Utf8(\\"interval 1 day\\"),live_connection_log.record_time)@0 as record_time_window2, device_model@1 as device_model, count(Int64(1))@2 as ]","output_rows":0,"elapsed_compute":19586,"metrics":{},"children":[{"name":"AggregateExec","param":"mode=FinalPartitioned, gby=[date_bin(Utf8(\\"interval 1 day\\"),live_connection_log.record_time)@0 as date_bin(Utf8(\\"interval 1 day\\"),live_connection_log.record_time), device_model@1 as device_model], aggr=[count(Int64(1))]","output_rows":0,"elapsed_compute":191616,"metrics":{"spilled_rows":0,"peak_mem_used":3840,"spill_count":0,"spilled_bytes":0},"children":[{"name":"CoalesceBatchesExec","param":"target_batch_size=8192","output_rows":0,"elapsed_compute":631,"metrics":{},"children":[{"name":"RepartitionExec","param":"partitioning=Hash([date_bin(Utf8(\\"interval 1 day\\"),live_connection_log.record_time)@0, device_model@1], 32), input_partitions=32","output_rows":0,"elapsed_compute":0,"metrics":{"repartition_time":35440,"send_time":1024,"fetch_time":12378552},"children":[{"name":"AggregateExec","param":"mode=Partial, gby=[date_bin(CAST(interval 1 day AS Interval(MonthDayNano)), record_time@1) as date_bin(Utf8(\\"interval 1 day\\"),live_connection_log.record_time), device_model@0 as device_model], aggr=[count(Int64(1))]","output_rows":0,"elapsed_compute":295784,"metrics":{"spilled_rows":0,"spilled_bytes":0,"spill_count":0,"skipped_aggregation_rows":0,"peak_mem_used":3840},"children":[{"name":"ProjectionExec","param":"expr=[device_model@10 as device_model, record_time@24 as record_time]","output_rows":0,"elapsed_compute":32,"metrics":{},"children":[{"name":"MergeScanExec","param":"peers=[4612794875904(1074, 0), 4612794875905(1074, 1), 4612794875906(1074, 2), 4612794875907(1074, 3), 4612794875908(1074, 4), 4612794875909(1074, 5), 4612794875910(1074, 6), 4612794875911(1074, 7), 4612794875912(1074, 8), 4612794875913(1074, 9), 4612794875914(1074, 10), ]","output_rows":0,"elapsed_compute":0,"metrics":{"greptime_exec_read_cost":0,"first_consume_time":11625941,"finish_time":11630099,"ready_time":9687264},"children":[]}]}]}]}]}]}]}',
            ],
            [
              1,
              0,
              '{"name":"CoalesceBatchesExec","param":"target_batch_size=8192","output_rows":0,"elapsed_compute":531,"metrics":{},"children":[{"name":"FilterExec","param":"record_time@24 >= 1739669990000000000 AND record_time@24 <= 1739756390000000000 AND connect_protocol@19 = 3","output_rows":0,"elapsed_compute":32,"metrics":{},"children":[{"name":"RepartitionExec","param":"partitioning=RoundRobinBatch(32), input_partitions=1","output_rows":0,"elapsed_compute":0,"metrics":{"repartition_time":1,"send_time":32,"fetch_time":15429},"children":[{"name":"UnorderedScan","param":"region=4612794875906(1074, 2), partition_count=0 (0 memtable ranges, 0 file 0 ranges)","output_rows":0,"elapsed_compute":0,"metrics":{"elapsed_poll":7614,"elapsed_await":1,"mem_used":0},"children":[]}]}]}]}',
            ],
            [
              1,
              1,
              '{"name":"CoalesceBatchesExec","param":"target_batch_size=8192","output_rows":0,"elapsed_compute":672,"metrics":{},"children":[{"name":"FilterExec","param":"record_time@24 >= 1739669990000000000 AND record_time@24 <= 1739756390000000000 AND connect_protocol@19 = 3","output_rows":0,"elapsed_compute":32,"metrics":{},"children":[{"name":"RepartitionExec","param":"partitioning=RoundRobinBatch(32), input_partitions=1","output_rows":0,"elapsed_compute":0,"metrics":{"repartition_time":1,"send_time":32,"fetch_time":4198},"children":[{"name":"UnorderedScan","param":"region=4612794875905(1074, 1), partition_count=0 (0 memtable ranges, 0 file 0 ranges)","output_rows":0,"elapsed_compute":0,"metrics":{"elapsed_poll":1412,"mem_used":0,"elapsed_await":1},"children":[]}]}]}]}',
            ],
            [
              1,
              2,
              '{"name":"CoalesceBatchesExec","param":"target_batch_size=8192","output_rows":0,"elapsed_compute":641,"metrics":{},"children":[{"name":"FilterExec","param":"record_time@24 >= 1739669990000000000 AND record_time@24 <= 1739756390000000000 AND connect_protocol@19 = 3","output_rows":0,"elapsed_compute":32,"metrics":{},"children":[{"name":"RepartitionExec","param":"partitioning=RoundRobinBatch(32), input_partitions=1","output_rows":0,"elapsed_compute":0,"metrics":{"fetch_time":10830,"repartition_time":1,"send_time":32},"children":[{"name":"UnorderedScan","param":"region=4612794875911(1074, 7), partition_count=0 (0 memtable ranges, 0 file 0 ranges)","output_rows":0,"elapsed_compute":0,"metrics":{"mem_used":0,"elapsed_await":1,"elapsed_poll":1513},"children":[]}]}]}]}',
            ],
            [
              1,
              3,
              '{"name":"CoalesceBatchesExec","param":"target_batch_size=8192","output_rows":0,"elapsed_compute":601,"metrics":{},"children":[{"name":"FilterExec","param":"record_time@24 >= 1739669990000000000 AND record_time@24 <= 1739756390000000000 AND connect_protocol@19 = 3","output_rows":0,"elapsed_compute":32,"metrics":{},"children":[{"name":"RepartitionExec","param":"partitioning=RoundRobinBatch(32), input_partitions=1","output_rows":0,"elapsed_compute":0,"metrics":{"send_time":32,"fetch_time":8166,"repartition_time":1},"children":[{"name":"UnorderedScan","param":"region=4612794875908(1074, 4), partition_count=0 (0 memtable ranges, 0 file 0 ranges)","output_rows":0,"elapsed_compute":0,"metrics":{"elapsed_await":1,"mem_used":0,"elapsed_poll":1383},"children":[]}]}]}]}',
            ],
            [
              1,
              4,
              '{"name":"CoalesceBatchesExec","param":"target_batch_size=8192","output_rows":0,"elapsed_compute":642,"metrics":{},"children":[{"name":"FilterExec","param":"record_time@24 >= 1739669990000000000 AND record_time@24 <= 1739756390000000000 AND connect_protocol@19 = 3","output_rows":0,"elapsed_compute":32,"metrics":{},"children":[{"name":"RepartitionExec","param":"partitioning=RoundRobinBatch(32), input_partitions=1","output_rows":0,"elapsed_compute":0,"metrics":{"repartition_time":1,"send_time":32,"fetch_time":5961},"children":[{"name":"UnorderedScan","param":"region=4612794875914(1074, 10), partition_count=0 (0 memtable ranges, 0 file 0 ranges)","output_rows":0,"elapsed_compute":0,"metrics":{"elapsed_poll":1372,"elapsed_await":1,"mem_used":0},"children":[]}]}]}]}',
            ],
            [
              1,
              5,
              '{"name":"CoalesceBatchesExec","param":"target_batch_size=8192","output_rows":0,"elapsed_compute":651,"metrics":{},"children":[{"name":"FilterExec","param":"record_time@24 >= 1739669990000000000 AND record_time@24 <= 1739756390000000000 AND connect_protocol@19 = 3","output_rows":0,"elapsed_compute":32,"metrics":{},"children":[{"name":"RepartitionExec","param":"partitioning=RoundRobinBatch(32), input_partitions=1","output_rows":0,"elapsed_compute":0,"metrics":{"fetch_time":9708,"repartition_time":1,"send_time":32},"children":[{"name":"UnorderedScan","param":"region=4612794875909(1074, 5), partition_count=0 (0 memtable ranges, 0 file 0 ranges)","output_rows":0,"elapsed_compute":0,"metrics":{"elapsed_await":1,"elapsed_poll":1222,"mem_used":0},"children":[]}]}]}]}',
            ],
            [
              1,
              6,
              '{"name":"CoalesceBatchesExec","param":"target_batch_size=8192","output_rows":0,"elapsed_compute":641,"metrics":{},"children":[{"name":"FilterExec","param":"record_time@24 >= 1739669990000000000 AND record_time@24 <= 1739756390000000000 AND connect_protocol@19 = 3","output_rows":0,"elapsed_compute":32,"metrics":{},"children":[{"name":"RepartitionExec","param":"partitioning=RoundRobinBatch(32), input_partitions=1","output_rows":0,"elapsed_compute":0,"metrics":{"fetch_time":13566,"repartition_time":1,"send_time":32},"children":[{"name":"UnorderedScan","param":"region=4612794875907(1074, 3), partition_count=0 (0 memtable ranges, 0 file 0 ranges)","output_rows":0,"elapsed_compute":0,"metrics":{"mem_used":0,"elapsed_poll":1032,"elapsed_await":1},"children":[]}]}]}]}',
            ],
            [
              1,
              7,
              '{"name":"CoalesceBatchesExec","param":"target_batch_size=8192","output_rows":0,"elapsed_compute":680,"metrics":{},"children":[{"name":"FilterExec","param":"record_time@24 >= 1739669990000000000 AND record_time@24 <= 1739756390000000000 AND connect_protocol@19 = 3","output_rows":0,"elapsed_compute":32,"metrics":{},"children":[{"name":"RepartitionExec","param":"partitioning=RoundRobinBatch(32), input_partitions=1","output_rows":0,"elapsed_compute":0,"metrics":{"fetch_time":3547,"repartition_time":1,"send_time":32},"children":[{"name":"UnorderedScan","param":"region=4612794875910(1074, 6), partition_count=0 (0 memtable ranges, 0 file 0 ranges)","output_rows":0,"elapsed_compute":0,"metrics":{"elapsed_poll":631,"mem_used":0,"elapsed_await":1},"children":[]}]}]}]}',
            ],
            [
              1,
              8,
              '{"name":"CoalesceBatchesExec","param":"target_batch_size=8192","output_rows":0,"elapsed_compute":561,"metrics":{},"children":[{"name":"FilterExec","param":"record_time@24 >= 1739669990000000000 AND record_time@24 <= 1739756390000000000 AND connect_protocol@19 = 3","output_rows":0,"elapsed_compute":32,"metrics":{},"children":[{"name":"RepartitionExec","param":"partitioning=RoundRobinBatch(32), input_partitions=1","output_rows":0,"elapsed_compute":0,"metrics":{"repartition_time":1,"fetch_time":15659,"send_time":32},"children":[{"name":"UnorderedScan","param":"region=4612794875912(1074, 8), partition_count=0 (0 memtable ranges, 0 file 0 ranges)","output_rows":0,"elapsed_compute":0,"metrics":{"mem_used":0,"elapsed_await":1,"elapsed_poll":4849},"children":[]}]}]}]}',
            ],
            [
              1,
              9,
              '{"name":"CoalesceBatchesExec","param":"target_batch_size=8192","output_rows":0,"elapsed_compute":600,"metrics":{},"children":[{"name":"FilterExec","param":"record_time@24 >= 1739669990000000000 AND record_time@24 <= 1739756390000000000 AND connect_protocol@19 = 3","output_rows":0,"elapsed_compute":32,"metrics":{},"children":[{"name":"RepartitionExec","param":"partitioning=RoundRobinBatch(32), input_partitions=1","output_rows":0,"elapsed_compute":0,"metrics":{"fetch_time":6913,"send_time":32,"repartition_time":1},"children":[{"name":"UnorderedScan","param":"region=4612794875913(1074, 9), partition_count=0 (0 memtable ranges, 0 file 0 ranges)","output_rows":0,"elapsed_compute":0,"metrics":{"mem_used":0,"elapsed_await":1,"elapsed_poll":1784},"children":[]}]}]}]}',
            ],
            [
              1,
              10,
              '{"name":"CoalesceBatchesExec","param":"target_batch_size=8192","output_rows":0,"elapsed_compute":611,"metrics":{},"children":[{"name":"FilterExec","param":"record_time@24 >= 1739669990000000000 AND record_time@24 <= 1739756390000000000 AND connect_protocol@19 = 3","output_rows":0,"elapsed_compute":32,"metrics":{},"children":[{"name":"RepartitionExec","param":"partitioning=RoundRobinBatch(32), input_partitions=1","output_rows":0,"elapsed_compute":0,"metrics":{"send_time":32,"fetch_time":4960,"repartition_time":1},"children":[{"name":"UnorderedScan","param":"region=4612794875904(1074, 0), partition_count=0 (0 memtable ranges, 0 file 0 ranges)","output_rows":0,"elapsed_compute":0,"metrics":{"mem_used":0,"elapsed_await":1,"elapsed_poll":1172},"children":[]}]}]}]}',
            ],
            [null, null, 'Total rows: 0'],
          ],
          total_rows: 13,
        },
      },
    ],
    execution_time_ms: 3,
  }

  const explainResultKeyCount = ref(0)

  const runCode = async (
    codeInfo: string,
    type: string,
    withoutSave = false,
    params = {} as PromForm,
    resultType = 'result'
  ) => {
    try {
      // TODO: try something better
      let oneResult = {} as ResultType
      // const res = exmpleRes as HttpResponse
      const res: HttpResponse = await API_MAP[type](codeInfo, params)

      console.log(res)
      const resultsInLog: Array<ResultInLog> = []
      res.output.forEach((oneRes: OutputType) => {
        if (Reflect.has(oneRes, 'records')) {
          const rowLength = oneRes.records.rows.length
          resultsInLog.push({
            type: 'select',
            rowCount: rowLength,
          })
          if (rowLength >= 0) {
            const pageType = CODE_TO_PAGE[type]
            if (!withoutSave) {
              if (Reflect.has(resultKeyCount, pageType)) {
                resultKeyCount[pageType] += 1
              } else {
                resultKeyCount[pageType] = 0
              }
            }

            oneResult = {
              records: oneRes.records,
              dimensionsAndXName:
                rowLength === 0
                  ? { dimensions: [], xAxis: '' }
                  : getDimensionsAndXName(oneRes.records.schema.column_schemas),
              // Use separate key counter for explain results
              key: resultType === 'explain' ? explainResultKeyCount.value : resultKeyCount[pageType],
              type,
              name: resultType,
            }
            // Increment appropriate counter
            if (!withoutSave) {
              if (resultType === 'explain') {
                explainResultKeyCount.value += 1
              } else if (Reflect.has(resultKeyCount, pageType)) {
                resultKeyCount[pageType] += 1
              } else {
                resultKeyCount[pageType] = 0
              }

              // Add or replace the result
              if (resultType === 'explain') {
                // Handle explain result
                manageExplainResult(oneResult)
              } else {
                // Add regular result
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

      const message = resultsInLog
        .map((result: ResultInLog) => {
          return i18n.global.tc(`dashboard.${result.type}`, result.rowCount, { rowCount: result.rowCount })
        })
        .join(`;\n`)

      Message.success({
        content: message,
        duration: 2 * 1000,
      })

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
          // TODO: move this into a function?
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

  // Add a method to ensure explain result is at the top
  const ensureExplainAtTop = () => {
    // If we have results but no explain result, we might want to add a placeholder
    // or just rearrange if an explain result exists but isn't at the top
    const explainIndex = results.value.findIndex((result) => result.name === 'explain')
    if (explainIndex > 0) {
      // Move explain result to the top
      const explainResult = results.value.splice(explainIndex, 1)[0]
      results.value.unshift(explainResult)
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

    // Keep explain results or filter based on types
    const explainResult = results.value.find((result) => result.name === 'explain')

    results.value = results.value.filter((result) => {
      // Keep the result if it's not in the types to clear
      // or if it's the explain result and we want to preserve it
      return !types.includes(result.type) || (result.name === 'explain' && explainResult)
    })

    // If we have an explain result, make sure it's at the top
    if (explainResult) {
      ensureExplainAtTop()
    }
  }

  const removeResult = (key: number, type: string) => {
    results.value = results.value.filter((item: ResultType) => item.key !== key || item.type !== type)
  }

  const writeInfluxDB = async (data: string, precision: string) => {
    try {
      const res: any = await editorAPI.writeInfluxDB(data, precision)
      return res
    } catch (error: any) {
      return error
    }
  }
  return {
    results,
    runCode,
    saveScript,
    removeResult,
    clear,
    writeInfluxDB,
    ensureExplainAtTop, // Export the new method
  }
})
export default useCodeRunStore
