import { useDataBaseStore } from '@/store'
import { ScriptTreeData, TableDetail, TableTreeChild, TableTreeParent } from '@/store/modules/database/types'
import editorAPI from '@/api/editor'
import { RecordsType } from '@/store/modules/code-run/types'

const tablesSearchKey = ref('')
const scriptsSearchKey = ref('')
const tablesTreeRef = ref()
const isRefreshingDetails = ref<{ [key: number]: boolean }>({ 0: false })

export default function useSiderTabs() {
  const { originTablesTree, originScriptsList } = storeToRefs(useDataBaseStore())
  const { getTableByName, addChildren, generateTreeChildren, getTables, getIndexesForColumns } = useDataBaseStore()

  // Deprecated.
  const searchTree = (keyword: string) => {
    const result: Array<TableTreeParent> = []
    originTablesTree.value.forEach((item: TableTreeParent) => {
      if (item.title.toLowerCase().indexOf(keyword.toLowerCase()) > -1) {
        result.push(item)
      } else if (item.columns?.length && item.childrenType === 'columns') {
        const columns = item.columns.filter(
          (child: TableTreeChild) => child.title.toLowerCase().indexOf(keyword.toLowerCase()) > -1
        )
        if (columns.length) {
          const newItem = item
          newItem.children = columns
          result.push(newItem)
        }
      }
    })
    return result
  }

  const searchList = (keyword: string) => {
    const loop = (data: ScriptTreeData[]) => {
      const result: ScriptTreeData[] = []
      data.forEach((item: ScriptTreeData) => {
        if (item.title.toLowerCase().indexOf(keyword.toLowerCase()) > -1) {
          result.push({ ...item })
        }
      })
      return result
    }
    return loop(originScriptsList.value)
  }

  const tablesTreeData = computed(() => {
    if (!tablesSearchKey.value) return originTablesTree.value
    return originTablesTree.value.filter(
      (item: TableTreeParent) => item.title.toLowerCase().indexOf(tablesSearchKey.value.toLowerCase()) > -1
    )
  })

  const scriptsListData = computed(() => {
    if (!scriptsSearchKey.value) return originScriptsList.value
    return searchList(scriptsSearchKey.value)
  })

  const refreshTables = () => {
    tablesSearchKey.value = ''

    getTables()
    if (tablesTreeRef.value) {
      tablesTreeRef.value.expandAll(false)
    }
  }

  const loadMoreColumns = (nodeData: TableTreeParent, isSilent?: boolean) =>
    new Promise<TableTreeChild[]>((resolve, reject) => {
      getTableByName(nodeData.title)
        .then((result: RecordsType) => {
          const {
            rows,
            schema: { column_schemas: columnSchemas },
          } = result
          const indexes = getIndexesForColumns(columnSchemas)
          const { treeChildren, timeIndexName } = generateTreeChildren(nodeData, rows, indexes)
          addChildren(nodeData.key, treeChildren, timeIndexName, 'columns', isSilent)
          resolve(treeChildren)
        })
        .catch(() => {
          reject()
        })
    })

  const loadMoreDetails = async (nodeData: TableTreeParent, isSilent?: boolean) => {
    isRefreshingDetails.value[nodeData.key] = true
    const createTable = new Promise<object>((resolve, reject) => {
      editorAPI
        .runSQL(`show create table "${nodeData.title}"`)
        .then((res: any) => {
          const sql = `${res.output[0].records.rows[0][1]}`
          const regex = /ttl = '(\w)+'/g
          const ttl = sql.match(regex)?.[0].slice(7, -1) || '-'
          const result = {
            key: 'createTable',
            value: { sql, ttl },
          }
          resolve(result)
        })
        .catch(() => {
          const result = {
            key: 'createTable',
            value: { sql: '-', ttl: '-' },
          }
          reject(result)
        })
    })

    const rowAndTime = new Promise<object>((resolve, reject) => {
      const getRowAndTime = () => {
        editorAPI
          .runSQL(
            nodeData.timeIndexName !== '%TIMESTAMP%'
              ? `select count(*), min (${nodeData.timeIndexName}), max (${nodeData.timeIndexName}) from "${nodeData.title}"`
              : `select count(*) from "${nodeData.title}"`
          )
          .then((res: any) => {
            const resArray = res.output[0].records.rows[0]
            const timestampType = res.output[0].records.schema.column_schemas[1]?.data_type || '-'
            const result = {
              key: 'rowAndTime',
              value: { rowCount: resArray[0], min: resArray[1] || '-', max: resArray[2] || '-', timestampType },
            }
            resolve(result)
          })
          .catch(() => {
            const result = {
              key: 'rowAndTime',
              value: { rowCount: '-', min: '-', max: '-' },
            }
            reject(result)
          })
      }
      if (!nodeData.timeIndexName) {
        loadMoreColumns(nodeData).then(() => getRowAndTime())
      } else {
        getRowAndTime()
      }
    })

    const settledResults: any[] = await Promise.allSettled([rowAndTime, createTable])
    const children: TableDetail[] = []
    const rowAndTimeResult = settledResults[0].value || settledResults[0].reason
    const createTableResult = settledResults[1].value || settledResults[1].reason
    children.push({
      key: `${nodeData.title}.details.${rowAndTimeResult.key}`,
      title: rowAndTimeResult.key,
      parentKey: nodeData.key,
      tableName: nodeData.title,
      isLeaf: true,
      info: { ...rowAndTimeResult.value, ttl: createTableResult.value.ttl },
      class: 'details',
    })
    children.push({
      key: `${nodeData.title}.details.${createTableResult.key}`,
      title: createTableResult.key,
      parentKey: nodeData.key,
      tableName: nodeData.title,
      isLeaf: true,
      info: createTableResult.value,
      class: 'details',
    })
    addChildren(nodeData.key, children, nodeData.timeIndexName, 'details', isSilent)
    isRefreshingDetails.value[nodeData.key] = false
    return children
  }

  const loadMore = async (nodeData: TableTreeParent) => {
    if (nodeData.childrenType === 'details') {
      return loadMoreDetails(nodeData)
    }
    originTablesTree.value[nodeData.key].children = nodeData.columns
    return nodeData.columns
  }

  return {
    tablesSearchKey,
    scriptsSearchKey,
    tablesTreeData,
    scriptsListData,
    isRefreshingDetails,
    tablesTreeRef,
    refreshTables,
    loadMore,
    loadMoreColumns,
    loadMoreDetails,
  }
}
