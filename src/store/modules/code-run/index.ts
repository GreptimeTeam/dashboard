import { getSqlResult } from '@/api/editor'
import { Message } from '@arco-design/web-vue'
import { defineStore } from 'pinia'
import { dateTypes } from '@/views/dashboard/data-explorer/components/data-view/config'

// TODO: Add all the types we decide instead of ECharts if needed in the future.

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
        const resultInLog: any = []
        res.output.forEach((oneRes: any) => {
          if ('records' in oneRes) {
            resultInLog.push({
              records: oneRes.records.rows.length,
            })
            this.titleIndex += 1
            this.results.push({
              records: oneRes.records,
              dimensionsAndXName: getDimensionsAndXName(oneRes.records.schema.column_schemas),
              key: this.titleIndex,
            })
            this.activeTabKey = this.titleIndex
          } else {
            resultInLog.push({
              affectedRows: oneRes.affectedrows,
            })
          }
        })

        pushLog({
          sql,
          ...res,
          result: resultInLog,
        })
      } catch (error: any) {
        pushLog({
          sql,
          ...error,
        })
      }
    },

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

    clearResult() {
      this.$reset()
    },
  },
})
export default useCodeRunStore
