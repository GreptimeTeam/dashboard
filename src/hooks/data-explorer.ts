const columns = ref<any>([])

// todo: change init code
const code = ref('select * from monitor')
// todo: compare sqlResult's code and current code
// const result = {
// table_data
// md5(code)
// }

const getSeriesAndLegendNames = ({ chartType, ySelectedTypes = [] }: any) => {
  const series: any = []
  const legendNames: any = []
  ySelectedTypes.forEach((item: any) => {
    const oneSeries = {
      name: item,
      type: chartType,
      encode: {
        x: 'ts',
        y: item,
      },
    }
    series.push(oneSeries)
    legendNames.push(item)
  })
  return { series, legendNames }
}

export default function useDataExplorer() {
  const { currentResult, activeTabKey } = useCodeRunStore()

  const makeOption = (item: any) => {
    const { series, legendNames } = getSeriesAndLegendNames(item)
    return {
      legend: {
        data: legendNames,
        orient: 'vertical',
      },
      tooltip: {},
      dataset: {
        dimensions: currentResult.dimensions,
        source: currentResult.rows,
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

  const insertNameToCode = (value: any) => {
    code.value += value
  }

  // todo: save code temp to local storage
  const codeChange = () => {
    // localStorage.setItem('code', code.value)
  }

  const gridColumn = computed(() => {
    return currentResult.schema.column_schemas.map((column: any) => {
      return {
        title: column.name,
        dataIndex: column.name,
        align: 'right',
      }
    })
  })

  const gridData = computed(() => {
    return currentResult.rows.map((row: any) => {
      const tempRow: any = {}
      row.forEach((item: any, index: number) => {
        tempRow[currentResult.schema.column_schemas[index].name] = item
      })
      return tempRow
    })
  })

  return {
    makeOption,
    codeChange,
    insertCode,
    insertNameToCode,
    code,
    columns,
    currentResult,
    gridColumn,
    gridData,
  }
}
