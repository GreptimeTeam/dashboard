import { useDataBaseStore } from '@/store'

const tablesSearchKey = ref('')
const scriptsSearchKey = ref('')
const { originTablesTree, originScriptsList } = storeToRefs(useDataBaseStore())

export default function useSiderTabs() {
  const searchTree = (keyword: string) => {
    const loop = (data: any) => {
      const result: any = []
      data.forEach((item: any) => {
        if (item.title.toLowerCase().indexOf(keyword.toLowerCase()) > -1) {
          result.push({ ...item })
        } else if (item.children) {
          const filterData = loop(item.children)
          if (filterData.length) {
            result.push({
              ...item,
              children: filterData,
            })
          }
        }
      })
      return result
    }
    return loop(originTablesTree.value)
  }

  const searchList = (keyword: string) => {
    const loop = (data: any) => {
      const result: any = []
      data.forEach((item: any) => {
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
    return searchTree(tablesSearchKey.value)
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
