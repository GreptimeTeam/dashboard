const columns = ref<any>([])

// todo: change init code
const code = ref('select * from scripts')
const cursorAt = ref<Array<number>>([])
// todo: compare sqlResult's code and current code
const { currentResult } = storeToRefs(useCodeRunStore())

const getSeriesAndLegendNames = ([chartType, ySelectedTypes = []]: any) => {
  const series: any = []
  const legendNames: any = []
  ySelectedTypes.forEach((item: any) => {
    const oneSeries = {
      name: item,
      type: chartType,
      smooth: false,
      encode: {
        x: currentResult.value.dimensionsAndXName[1],
        y: item,
      },
    }
    if (chartType === 'line(smooth)') {
      oneSeries.type = 'line'
      oneSeries.smooth = true
    }
    series.push(oneSeries)
    legendNames.push(item)
  })
  return { series, legendNames }
}

export default function useDataExplorer() {
  const makeOption = (item: any) => {
    const { series, legendNames } = getSeriesAndLegendNames(item)
    console.log(currentResult.value.dimensionsAndXName)

    return {
      legend: {
        data: legendNames,
        orient: 'vertical',
      },
      tooltip: {},
      dataset: {
        dimensions: currentResult.value.dimensionsAndXName[0],
        source: currentResult.value.rows,
      },
      xAxis: {
        type: 'time',
        name: 'Time',
        axisLine: {
          lineStyle: {
            type: 'solid',
          },
        },
      },
      yAxis: {
        axisLine: {
          lineStyle: {
            type: 'solid',
          },
        },
      },
      series,
    }
  }

  // todo: change to computed instead of using array?

  const insertCode = (value: any) => {
    code.value = `${code.value}\n${value}`
  }

  const insertNameToCode = (name: any) => {
    code.value = code.value.substring(0, cursorAt.value[0]) + name + code.value.substring(cursorAt.value[1])
  }

  // todo: save code temp to local storage

  const gridColumn = computed(() => {
    return currentResult.value.schema.column_schemas.map((column: any) => {
      return {
        title: column.name,
        dataIndex: column.name,
        align: 'right',
      }
    })
  })

  const gridData = computed(() => {
    return currentResult.value.rows.map((row: any) => {
      const tempRow: any = {}
      row.forEach((item: any, index: number) => {
        tempRow[currentResult.value.schema.column_schemas[index].name] = item
      })
      return tempRow
    })
  })

  const yOptions = computed(() => {
    console.log(currentResult.value.schema.column_schemas)
    return currentResult.value.schema.column_schemas
      .filter((item: any) => item.data_type === 'Int' || item.data_type === 'Float64')
      .map((item: any) => ({
        value: item.name,
      }))
  })

  return {
    makeOption,
    insertCode,
    insertNameToCode,
    code,
    cursorAt,
    columns,
    currentResult,
    gridColumn,
    gridData,
    yOptions,
  }
}
