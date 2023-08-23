import editorAPI from '@/api/editor'
import { TreeChild, TreeData } from './types'

const useDataBaseStore = defineStore('database', () => {
  const { database } = storeToRefs(useAppStore())
  const tablesData = ref()
  const originTablesTree = ref<TreeData[]>([])

  const scriptsData = ref()
  const tablesLoading = ref(false)
  const scriptsLoading = ref(false)

  const getOriginTablesTree = () => {
    const tempArray: TreeData[] = []
    let key = 0
    if (tablesData.value) {
      tablesData.value.output[0].records.rows.forEach((item: Array<string>) => {
        const node: TreeData = {
          title: item.join(),
          key,
          children: [],
        }
        tempArray.push(node)
        key += 1
      })
    }

    return tempArray
  }

  const addChildren = (key: number, children: TreeChild[]) => {
    originTablesTree.value[key].children = children
  }

  const originScriptsList = computed(() => {
    const tempArray: TreeData[] = []
    if (scriptsData.value) {
      scriptsData.value.output[0].records.rows.forEach((item: Array<string>) => {
        const node: TreeData = {
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
  }
})

export default useDataBaseStore
