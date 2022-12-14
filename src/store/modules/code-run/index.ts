import { getSqlResult } from '@/api/editor'
import { Message } from '@arco-design/web-vue'
import { defineStore } from 'pinia'
import { dateTypes } from '@/views/dashboard/data-explorer/components/data-view/config'

// TODO: Add all the types we decide instead of ECharts if needed in the future.
// const TYPE_MAP: any = {
//   Timestamp: 'time',
//   String: 'ordinal',
//   Float64: 'float',
//   Int: 'int',
// }

const getDimensionsAndXName = (elements: any) => {
  const tempDimensions: any = []
  let xAxisName = ''
  let findTimeFlag = false
  elements.forEach((element: any) => {
    if (!findTimeFlag && dateTypes.find((type: string) => type === element.data_type)) {
      findTimeFlag = true
      xAxisName = element.name
    }
    const oneDimension = {
      name: element.name,
      // Note: let ECharts decide type for now.
      // type: TYPE_MAP[element.data_type] || 'ordinal',
    }

    tempDimensions.push(oneDimension)
  })
  return [tempDimensions, xAxisName]
}

const useCodeRunStore = defineStore('codeRun', {
  state: () => ({
    titleIndex: <number>-1,
    results: <any>[],
    activeTabKey: <number>0,
  }),

  getters: {
    currentResult(state) {
      return state.results.find((item: any) => item.key === state.activeTabKey) || {}
    },
  },

  actions: {
    async fetchSQLResult(sql: any) {
      const { pushLog } = useLogStore()
      try {
        const res: any = await getSqlResult(sql)

        Message.success({
          content: 'success',
        })
        if (sql.toLocaleLowerCase().substring(0, 6) === 'select') {
          this.titleIndex += 1
          this.results.push({
            // TODO: multiple results
            ...res.output[0].records,
            dimensionsAndXName: getDimensionsAndXName(res.output[0].records.schema.column_schemas),
            key: this.titleIndex,
            sql,
          })
          this.activeTabKey = this.titleIndex
        }

        pushLog({
          sql,
          ...res,
          ...res.output[0],
        })
      } catch (error: any) {
        pushLog({
          sql,
          ...error,
        })
      }
    },
    // todo: can we combine next two logs into one line code?

    setActiveTabKey(key: number) {
      this.activeTabKey = key
    },

    removeResult(key: number) {
      if (this.results.length === 1) {
        this.$reset()
        return
      }
      let deletedTabIndex = this.results.findIndex((item: any) => item.key === key)
      if (deletedTabIndex + 1 === this.results.length) {
        deletedTabIndex -= 1
      }
      this.results = this.results.filter((item: any) => item.key !== key)
      this.activeTabKey = this.results[deletedTabIndex].key
    },
  },
})
export default useCodeRunStore
