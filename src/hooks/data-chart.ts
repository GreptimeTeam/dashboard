import { ResultType } from '../store/modules/code-run/types'
import { numberTypes } from '../views/dashboard/config'

export default function useDataChart(data: ResultType) {
  const hasTimestamp = data?.dimensionsAndXName?.[1] !== ''
  const schemaInRecords = computed(() => data?.records?.schema)

  // TODO: Add support for more data types not just numbers.
  const yOptions = computed(() => {
    if (!schemaInRecords.value || !hasTimestamp) return []
    return schemaInRecords.value.column_schemas
      .filter((item: any) => numberTypes.find((type: string) => type === item.data_type))
      .map((item: any) => ({
        value: item.name,
      }))
  })

  const hasChart = computed(() => {
    return yOptions.value.length > 0
  })

  const hasGrid = computed(() => {
    return data?.records && !!Object.values(data?.records).length
  })

  return {
    yOptions,
    hasChart,
    hasGrid,
  }
}
