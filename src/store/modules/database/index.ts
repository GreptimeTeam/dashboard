import editorAPI from '@/api/editor'
import { SEMANTIC_TYPE_MAP } from '@/views/dashboard/config'
import { ScriptTreeData, TableTreeChild, TableTreeParent } from './types'
import { SchemaType } from '../code-run/types'

const useDataBaseStore = defineStore('database', () => {
  const { database } = storeToRefs(useAppStore())
  const tablesData = ref()
  const scriptsData = ref()
  const originTablesTree = ref<TableTreeParent[]>([])
  const tablesLoading = ref(false)
  const scriptsLoading = ref(false)

  const getOriginTablesTree = () => {
    const tempArray: TableTreeParent[] = []
    let key = 0
    if (tablesData.value) {
      tablesData.value.output[0].records.rows.forEach((item: Array<string>) => {
        const node: TableTreeParent = {
          title: item.join(),
          key,
          children: [],
          columns: [],
          details: [],
          timeIndexName: '',
          childrenType: 'columns',
          isLeaf: false,
        }
        tempArray.push(node)
        key += 1
      })
    }
    return tempArray
  }

  const generateTreeChildren = (nodeData: TableTreeParent, rows: string[][], columnSchemas: SchemaType[]) => {
    const treeChildren: TableTreeChild[] = []
    const columnNameIndex = columnSchemas.findIndex((schema: SchemaType) => {
      return schema.name === 'Field' || schema.name === 'Column'
    })
    const dataTypeIndex = columnSchemas.findIndex((schema: SchemaType) => {
      return schema.name === 'Type'
    })

    const semanticTypeIndex = columnSchemas.findIndex((schema: SchemaType) => {
      return schema.name === 'Semantic Type'
    })
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

  const addChildren = (key: number, children: TableTreeChild[], timeIndexName: string, type?: string) => {
    originTablesTree.value[key].children = children
    originTablesTree.value[key].timeIndexName = timeIndexName
    originTablesTree.value[key][type === 'details' ? 'details' : 'columns'] = children
  }

  const originScriptsList = computed(() => {
    const tempArray: ScriptTreeData[] = []
    if (scriptsData.value) {
      scriptsData.value.output[0].records.rows.forEach((item: Array<string>) => {
        const node: ScriptTreeData = {
          title: item[1],
          key: item[1],
          code: item[2],
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
      const res = await editorAPI.getTables()
      tablesData.value = res
      originTablesTree.value = getOriginTablesTree()
    } catch (error) {
      tablesData.value = null
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
  }
})

export default useDataBaseStore
