import editorAPI from '@/api/editor'
import { TreeData } from './types'

const useDataBaseStore = defineStore('database', () => {
  const { database } = storeToRefs(useAppStore())
  const tablesData = ref()
  const originTablesTree = ref<TreeData[]>([])

  const scriptsData = ref()
  const tablesLoading = ref(false)
  const scriptsLoading = ref(false)

  const getOriginTablesTree = () => {
    const tempArray: Array<TreeData> = []
    let key = 0
    tablesData.value.output[0].records.rows.forEach((item: Array<string>) => {
      const node: TreeData = {
        title: item.join(),
        key,
      }
      tempArray.push(node)
      key += 1
    })
    return tempArray
  }

  const addChildren = (key: number, children: TreeData[]) => {
    originTablesTree.value[key].children = children
  }

  const originScriptsList = computed(() => {
    const tempArray: any = []
    if (scriptsData.value) {
      scriptsData.value.output[0].records.rows.forEach((item: Array<string>) => {
        const node = {
          title: item[1],
          key: item[1],
          code: item[2],
          isLeaf: true,
        }
        tempArray.push(node)
      })
    }

    return tempArray
  })

  async function getTables() {
    tablesLoading.value = true
    try {
      const res = await editorAPI.getTables()
      tablesData.value = res
      originTablesTree.value = getOriginTablesTree()
    } catch (error) {
      // some error
    }
    tablesLoading.value = false
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
    scriptsLoading.value = true
    try {
      const res = await editorAPI.getScriptsTable(database.value)
      scriptsData.value = res
    } catch (error) {
      // some error
    }
    scriptsLoading.value = false
  }

  return {
    originTablesTree,
    originScriptsList,
    tablesLoading,
    scriptsLoading,
    getTables,
    addChildren,
    getTableByName,
    getScriptsTable,
  }
})

export default useDataBaseStore
