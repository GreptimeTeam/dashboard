import { ref, computed } from 'vue'
import { useCodeRunStore } from '@/store'
import { storeToRefs } from 'pinia'

const codeRunStore = useCodeRunStore()
const { runResult, activeTabKey } = storeToRefs(codeRunStore)

const chartType = ref('line')
const yOptions = ref<any>([])
const source = ref<any>([])
const columns = ref<any>([])
const dimensions = ref<any>([])
const ySelectedTypes = ref<any>([])

// todo: change init code
const code = ref('select * from monitor')
// todo: compare sqlResult's code and current code
// const result = {
// table_data
// md5(code)
// }

export default function useDataExplorer() {
  // todo : need array?
  const seriesAndLegendNames = computed(() => {
    const tempSeries: any = []
    const tempLegendNames: any = []
    ySelectedTypes.value.forEach((item: any) => {
      const oneSeries = {
        name: item,
        type: chartType.value,
        encode: {
          x: 'ts',
          y: item,
        },
      }
      tempSeries.push(oneSeries)
      tempLegendNames.push(item)
    })
    return [tempSeries, tempLegendNames]
  })

  const makeOption = (item: any) => {
    ;[chartType.value, ySelectedTypes.value] = item

    return {
      legend: {
        data: seriesAndLegendNames.value[1],
        orient: 'vertical',
        right: 10,
        top: 'center',
      },
      tooltip: {},
      dataset: {
        dimensions: dimensions.value[activeTabKey.value],
        source: source.value[activeTabKey.value],
      },
      xAxis: { type: 'time' },
      yAxis: {},
      series: seriesAndLegendNames.value[0],
    }
  }

  // todo: change to computed instead of using array?

  const initSqlResult = () => {
    const data = runResult.value[activeTabKey.value]
    const { output } = data
    // todo: support multiple records in the future
    const { records } = output[0]
    const tempYOptions: any = []
    const tempDimensions: any = []
    records.schema.column_schemas.forEach((element: any) => {
      const tempElement = {}

      ;(tempElement as any).name = element.name
      switch (element.data_type) {
        case 'Timestamp':
          ;(tempElement as any).type = 'time'
          break
        case 'String':
          ;(tempElement as any).type = 'ordinal'
          break
        case 'Float64':
          ;(tempElement as any).type = 'float'
          break
        case 'Int':
          ;(tempElement as any).type = 'int'
          break
        default:
          ;(tempElement as any).type = 'ordinal'
      }
      tempDimensions.push(tempElement)
      if (element.data_type === 'Int' || element.data_type === 'Float64') {
        const item = {
          value: element.name,
        }
        tempYOptions.push(item)
      }
    })
    dimensions.value.push(tempDimensions)
    source.value.push(records.rows)
    yOptions.value.push(tempYOptions)
    columns.value.push(records.schema.column_schemas)
  }

  const insertCode = (value: any) => {
    code.value = `${code.value}\n${value}`
  }

  const insertNameToCode = (value: any) => {
    code.value += value
  }

  // todo: save code temp to local storage
  const codeChange = () => {
    // localStorage.setItem('code', code.value)
  }

  return {
    initSqlResult,
    makeOption,
    codeChange,
    insertCode,
    insertNameToCode,
    yOptions,
    source,
    code,
    columns,
  }
}
