import editorAPI from '@/api/editor'
import { SEMANTIC_TYPE_MAP } from '@/views/dashboard/config'
import { groupByToMap } from '@/utils'
import { ScriptTreeData, TableDetail, TableTreeChild, TableTreeParent } from './types'
import { RecordsType, SchemaType } from '../code-run/types'

const useDataBaseStore = defineStore('database', () => {
  const { database } = storeToRefs(useAppStore())
  const tablesData = ref<RecordsType>()
  const scriptsData = ref()
  const originTablesTree = ref<TableTreeParent[]>([])
  const tablesLoading = ref(false)
  const scriptsLoading = ref(false)

  const getIndexes = (columnSchemas: SchemaType[]) => {
    // TODO: get indexes only once?
    const columnNameIndex = columnSchemas.findIndex((schema: SchemaType) => {
      return schema.name === 'Field' || schema.name === 'Column' || schema.name === 'column_name'
    })
    const dataTypeIndex = columnSchemas.findIndex((schema: SchemaType) => {
      return schema.name === 'Type' || schema.name === 'data_type'
    })

    const semanticTypeIndex = columnSchemas.findIndex((schema: SchemaType) => {
      return schema.name === 'Semantic Type' || schema.name === 'semantic_type'
    })

    return { columnNameIndex, dataTypeIndex, semanticTypeIndex }
  }

  const generateTreeChildren = (nodeData: TableTreeParent, rows: string[][], indexes: { [key: string]: number }) => {
    const treeChildren: TableTreeChild[] = []
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
    })
    return {
      treeChildren,
      timeIndexName,
    }
  }

  const getOriginTablesTree = () => {
    const tempArray: TableTreeParent[] = []
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

        const { treeChildren, timeIndexName } = generateTreeChildren(node, groupResults, indexes)
        node.columns = treeChildren
        node.timeIndexName = timeIndexName
        tempArray.push(node)
        key += 1
      })
    }
    return tempArray
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
      originTablesTree.value = getOriginTablesTree()
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
      const res = await editorAPI.getTableByName(node)
      return res
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
