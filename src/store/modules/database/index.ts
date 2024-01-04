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
  const originTablesTree = ref<TableTreeParent[]>([])
  const tablesLoading = ref(false)
  const scriptsLoading = ref(false)
  const hints = ref({} as { sql: { schema: { [key: string]: string[] } }; promql: Set<string> })

  const extensions = ref<{
    sql: any[]
    promql: any[]
  }>({
    sql: [sql(hints.value.sql), oneDark],
    promql: [new PromQLExtension().asExtension(), oneDark],
  })

  const getIndexes = (columnSchemas: SchemaType[]) => {
    const columnNameIndex = columnSchemas.findIndex((schema: SchemaType) => {
      return schema.name === 'column_name'
    })
    const dataTypeIndex = columnSchemas.findIndex((schema: SchemaType) => {
      return schema.name === 'data_type'
    })

    const semanticTypeIndex = columnSchemas.findIndex((schema: SchemaType) => {
      return schema.name === 'semantic_type'
    })

    return { columnNameIndex, dataTypeIndex, semanticTypeIndex }
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
    const tablesTree: TableTreeParent[] = []
    const schema: { [key: string]: string[] } = {}
    const initialMetricList = new Set<string>()
    let key = 0
    if (tablesData.value) {
      const schemas = tablesData.value.schema.column_schemas

      const tableNameIndex: number = schemas.findIndex(({ name }) => name === 'table_name')
      const indexes = getIndexes(schemas)

      const dataWithGroup = groupByToMap(tablesData.value.rows, (value: any) => {
        return value[tableNameIndex]
      })

      dataWithGroup.forEach((groupResults: [][], title: string) => {
        const node: TableTreeParent = {
          title,
          key,
          children: [],
          columns: [],
          details: [],
          timeIndexName: '',
          childrenType: 'columns',
          isLeaf: false,
        }
        const { treeChildren, timeIndexName, columnNames } = generateTreeChildren(node, groupResults, indexes)

        node.columns = treeChildren
        node.timeIndexName = timeIndexName
        tablesTree.push(node)
        key += 1

        initialMetricList.add(title)
        schema[title] = columnNames
        columnNames.forEach((name: string) => {
          initialMetricList.add(name)
        })
      })
    }

    return { tablesTree, schema, initialMetricList }
  }

  const addChildren = (
    key: number,
    children: TableTreeChild[] | TableDetail[],
    timeIndexName: string,
    type: string,
    isSilent?: boolean
  ) => {
    if (!isSilent) {
      originTablesTree.value[key].children = children
    }
    originTablesTree.value[key].timeIndexName = timeIndexName
    if (type === 'details') {
      originTablesTree.value[key].details = children as TableDetail[]
    } else {
      originTablesTree.value[key].columns = children as TableTreeChild[]
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

  async function getTables() {
    const { updateDataStatus } = useUserStore()
    updateDataStatus('tables', true)
    tablesLoading.value = true
    try {
      const res: any = await editorAPI.getTables()
      tablesData.value = res.output[0].records
      const { tablesTree, initialMetricList, schema } = getOriginTablesTree()
      originTablesTree.value = tablesTree
      hints.value = {
        sql: { schema },
        promql: initialMetricList,
      }
      const promql = new PromQLExtension().setComplete({
        remote: {
          fetchFn: () => Promise.reject(),
          cache: {
            initialMetricList: [...hints.value.promql],
          },
        },
      })
      extensions.value.sql = [sql(hints.value.sql), oneDark]
      extensions.value.promql = [promql.asExtension(), oneDark]
    } catch (error) {
      tablesData.value = undefined
      originTablesTree.value = []
      tablesLoading.value = false
      return false
    }
    tablesLoading.value = false
    return true
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
      const res = await editorAPI.getScriptsTable(database.value)
      scriptsData.value = res
    } catch (error) {
      scriptsData.value = null
    }
    scriptsLoading.value = false
  }

  const resetData = () => {
    originTablesTree.value = []
    scriptsData.value = null
  }

  return {
    originTablesTree,
    originScriptsList,
    tablesLoading,
    scriptsLoading,
    tablesData,
    scriptsData,
    hints,
    extensions,
    getTables,
    addChildren,
    getTableByName,
    getScriptsTable,
    resetData,
    generateTreeChildren,
    getIndexes,
  }
})

export default useDataBaseStore
