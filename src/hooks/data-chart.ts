import { ResultType, SchemaType } from '../store/modules/code-run/types'
import { dateTypes, numberTypes } from '../views/dashboard/config'

export default function useDataChart(data: ResultType) {
  const groupBySelectedTypes: Array<string> = []
  const chartForm = reactive({
    chartType: 'line',
    selectedYTypes: [''],
    groupBySelectedTypes,
  })
  const hasTimestamp = data.dimensionsAndXName.xAxis !== ''
  const schemaInRecords = data.records.schema

  // TODO: Add support for more data types not just numbers.
  const yOptions = computed(() => {
    if (!schemaInRecords || !hasTimestamp) return []
    return schemaInRecords.column_schemas
      .filter((item: SchemaType) => numberTypes.find((type: string) => type === item.data_type))
      .map((item: SchemaType) => ({
        value: item.name,
      }))
  })

  const groupByOptions = computed(() => {
    return schemaInRecords.column_schemas
      .map((item: SchemaType, index: number) => ({
        ...item,
        index,
      }))
      .filter(
        (item: SchemaType) =>
          !dateTypes.find((type: string) => type === item.data_type) && item.name !== chartForm.selectedYTypes[0]
      )
  })

  const hasChart = computed(() => {
    return yOptions.value.length > 0
  })

  return {
    chartForm,
    yOptions,
    groupByOptions,
    hasChart,
  }
}
