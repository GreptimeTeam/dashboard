import { useDataBaseStore } from '@/store'
import { ScriptTreeData, TableTreeChild, TableTreeParent, TreeChild, TreeData } from '@/store/modules/database/types'

const tablesSearchKey = ref('')
const scriptsSearchKey = ref('')
const { originTablesTree, originScriptsList } = storeToRefs(useDataBaseStore())

export default function useSiderTabs() {
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

  return {
    tablesSearchKey,
    scriptsSearchKey,
    tablesTreeData,
    scriptsListData,
  }
}
