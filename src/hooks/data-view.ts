import { getSqlResult } from '@/api/editor'
import { ref, computed } from 'vue'

const chartType = ref('line')
const yOptions = ref<any>([])
const source = ref<any>([])
const dimensions = ref<any>([])

export default function useSqlResult() {
  const ySelectedTypes = ref<any>([])

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
        dimensions: dimensions.value,
        source: source.value,
      },
      xAxis: { type: 'time' },
      yAxis: {},
      series: seriesAndLegendNames.value[0],
    }
  }

  const initSqlResult = async () => {
    const data = await getSqlResult()
    const {
      output: { records },
    } = data
    const tempYOptions: any = []
    records.schema.column_schemas.forEach((element) => {
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
      dimensions.value.push(tempElement)
      if (element.data_type === 'Int' || element.data_type === 'Float64') {
        const item = {
          value: element.name,
        }
        tempYOptions.push(item)
      }
    })

    source.value = records.rows
    yOptions.value = tempYOptions
  }

  return {
    initSqlResult,
    makeOption,
    yOptions,
    source,
  }
}
