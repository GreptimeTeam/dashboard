import editorAPI from '@/api/editor'
import { SEMANTIC_TYPE_MAP } from '@/views/dashboard/config'
import { groupByToMap } from '@/utils'
import { oneDark } from '@codemirror/theme-one-dark'
import { sql } from '@codemirror/lang-sql'
import { Extension } from '@codemirror/state'
import { PromQLExtension } from '@prometheus-io/codemirror-promql'
import { ScriptTreeData, TableDetail, TableTreeChild, TableTreeParent } from './types'
import { RecordsType, SchemaType } from '../code-run/types'

const useDataBaseStore = defineStore('database', () => {
  const { database } = storeToRefs(useAppStore())
  const tablesData = ref<RecordsType>()
  const scriptsData = ref()
  const tablesTreeForDatabase = ref({} as { [key: string]: TableTreeParent[] })
  const originTablesTree = computed(() => {
    return tablesTreeForDatabase.value[database.value] || []
  })
  const tablesLoading = ref(false)
  const totalTablesLoading = ref(false)
  const scriptsLoading = ref(false)

  const hints = computed(() => {
    const schema: { [key: string]: string[] } = {}
    const initialMetricList = new Set<string>()
    originTablesTree.value.forEach((item: TableTreeParent) => {
      const columns = item.columns.map((child: TableTreeChild) => {
        initialMetricList.add(child.title)
        return child.title
      })
      schema[item.title] = columns
      initialMetricList.add(item.title)
    })

    return { sql: { schema }, promql: initialMetricList }
  })

  const extensions = ref<{
    sql: any[]
    promql: any[]
  }>({
    sql: [sql(hints.value.sql), oneDark],
    promql: [new PromQLExtension().asExtension(), oneDark],
  })

  watch(hints, () => {
    extensions.value.sql = [sql(hints.value.sql), oneDark]
    const promql = new PromQLExtension().setComplete({
      remote: {
        fetchFn: () => Promise.reject(),
        cache: {
          initialMetricList: [...hints.value.promql],
        },
      },
    })
    extensions.value.promql = [promql.asExtension(), oneDark]
  })

  const getIndexesForColumns = (columnSchemas: SchemaType[]) => {
    const columnNameIndex = columnSchemas.findIndex((schema: SchemaType) => {
      return schema.name === 'column_name'
    })
    const dataTypeIndex = columnSchemas.findIndex((schema: SchemaType) => {
      return schema.name === 'greptime_data_type' || schema.name === 'data_type'
    })

    const semanticTypeIndex = columnSchemas.findIndex((schema: SchemaType) => {
      return schema.name === 'semantic_type'
    })

    const tableTypeIndex = columnSchemas.findIndex((schema: SchemaType) => {
      return schema.name === 'table_type'
    })

    return { columnNameIndex, dataTypeIndex, semanticTypeIndex, tableTypeIndex }
  }

  const getIndexesForTables = (columnSchemas: SchemaType[]) => {
    const tableNameIndex = columnSchemas.findIndex((schema: SchemaType) => {
      return schema.name === 'table_name'
    })
    const tableTypeIndex = columnSchemas.findIndex((schema: SchemaType) => {
      return schema.name === 'table_type'
    })

    return { tableNameIndex, tableTypeIndex }
  }

  const generateTreeChildren = (nodeData: TableTreeParent, rows: string[][], indexes: { [key: string]: number }) => {
    const treeChildren: TableTreeChild[] = []
    const columnNames: string[] = []
    const { semanticTypeIndex, columnNameIndex, dataTypeIndex } = indexes

    let timeIndexName = '%TIMESTAMP%'

    rows.forEach((row: string[]) => {
      const iconType = SEMANTIC_TYPE_MAP[row[semanticTypeIndex]]
      if (iconType === 'TIMESTAMP') {
        timeIndexName = row[columnNameIndex]
      }
      treeChildren.push({
        title: row[columnNameIndex],
        key: `${nodeData.title}.${row[columnNameIndex]}`,
        isLeaf: true,
        dataType: row[dataTypeIndex],
        iconType,
        parentKey: nodeData.key,
      })
      columnNames.push(row[columnNameIndex])
    })
    return {
      treeChildren,
      timeIndexName,
      columnNames,
    }
  }

  const getOriginTablesTree = () => {
    let key = tablesTreeForDatabase.value[database.value].length
    if (tablesData.value) {
      const schemas: SchemaType[] = tablesData.value.schema?.column_schemas || []
      const { tableNameIndex, tableTypeIndex } = getIndexesForTables(schemas)
      tablesData.value.rows.forEach((row: string[]) => {
        const node: TableTreeParent = {
          title: row[tableNameIndex],
          key,
          children: [],
          columns: [],
          details: [],
          timeIndexName: '',
          childrenType: 'columns',
          isLeaf: false,
          tableType: row[tableTypeIndex],
        }
        tablesTreeForDatabase.value[database.value].push(node)
        key += 1
      })
    }
  }

  const addChildren = (
    key: number,
    children: TableTreeChild[] | TableDetail[],
    timeIndexName: string,
    type: string,
    isSilent?: boolean
  ) => {
    if (!isSilent) {
      tablesTreeForDatabase.value[database.value][key].children = children
    }
    tablesTreeForDatabase.value[database.value][key].timeIndexName = timeIndexName
    if (type === 'details') {
      tablesTreeForDatabase.value[database.value][key].details = children as TableDetail[]
    } else {
      tablesTreeForDatabase.value[database.value][key].columns = children as TableTreeChild[]
    }
  }

  const originScriptsList = computed(() => {
    const tempArray: ScriptTreeData[] = []
    if (scriptsData.value) {
      const columnSchemas: SchemaType[] = scriptsData.value.output[0].records.schema?.column_schemas || []
      const scriptNameIndex = columnSchemas.findIndex((schema: SchemaType) => {
        return schema.name === 'name'
      })
      const scriptCodeIndex = columnSchemas.findIndex((schema: SchemaType) => {
        return schema.name === 'script'
      })
      scriptsData.value.output[0].records.rows.forEach((item: Array<string>) => {
        const node: ScriptTreeData = {
          title: item[scriptNameIndex],
          key: item[scriptNameIndex],
          code: item[scriptCodeIndex],
          isLeaf: true,
          children: [],
        }
        tempArray.push(node)
      })
    }

    return tempArray
  })

  const getTablesCount = async () => {
    try {
      const res: any = await editorAPI.fetchTablesCount()
      const count: number = res.output[0].records.rows[0][0]
      return count
    } catch {
      return 0
    }
  }

  async function getTables() {
    tablesLoading.value = true
    totalTablesLoading.value = true

    // TODO: better not change dom
    tablesTreeForDatabase.value[database.value] = []
    const total = await getTablesCount()
    if (total === 0) {
      tablesLoading.value = false
      totalTablesLoading.value = false
      return
    }

    // TODO: limit?
    const pageSize = 300
    const maxPage = Math.ceil(total / pageSize)

    for (let page = 1; page <= maxPage; page += 1) {
      try {
        // eslint-disable-next-line no-await-in-loop
        const res: any = await editorAPI.getTables(pageSize, pageSize * (page - 1))
        tablesData.value = res.output[0].records
        getOriginTablesTree()
        // Stop loading status when tables of the first page are loaded
        tablesLoading.value = false
      } catch (error) {
        tablesData.value = undefined
        // TODO: limit?
        tablesTreeForDatabase.value[database.value] = []
        tablesLoading.value = false
        totalTablesLoading.value = false
        break
      }
    }
    totalTablesLoading.value = false
  }

  const checkTables = () => {
    const { updateDataStatus } = useUserStore()
    updateDataStatus('tables', true)
    if (tablesTreeForDatabase.value[database.value] && tablesTreeForDatabase.value[database.value].length > 0) {
      return
    }
    getTables()
  }

  async function getTableByName(node: any) {
    try {
      const res: any = await editorAPI.getTableByName(node)
      return res.output[0].records
    } catch (error) {
      return false
    }
  }

  async function getScriptsTable() {
    const { updateDataStatus } = useUserStore()
    updateDataStatus('scripts', true)
    scriptsLoading.value = true
    try {
      const res: any = await editorAPI.checkScriptsTable()
      if (res.output[0].records.rows[0][0] === 0) {
        scriptsData.value = null
      } else {
        try {
          const scripts = await editorAPI.getScriptsTable()
          scriptsData.value = scripts
        } catch (error) {
          scriptsData.value = null
        }
      }
    } catch (error) {
      scriptsData.value = null
    }
    scriptsLoading.value = false
  }

  const resetData = () => {
    tablesTreeForDatabase.value[database.value] = []
    scriptsData.value = null
  }

  return {
    tablesTreeForDatabase,
    originTablesTree,
    originScriptsList,
    tablesLoading,
    totalTablesLoading,
    scriptsLoading,
    tablesData,
    scriptsData,
    hints,
    extensions,
    getTables,
    checkTables,
    addChildren,
    getTableByName,
    getScriptsTable,
    resetData,
    generateTreeChildren,
    getIndexesForColumns,
  }
})

export default useDataBaseStore
