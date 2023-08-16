import { useDataBaseStore } from '@/store'
import { TreeChild, TreeData } from '@/store/modules/database/types'

const tablesSearchKey = ref('')
const scriptsSearchKey = ref('')
const { originTablesTree, originScriptsList } = storeToRefs(useDataBaseStore())

export default function useSiderTabs() {
  // TODO: try a better function
  const searchTree = (keyword: string) => {
    const result: Array<TreeData> = []
    originTablesTree.value.forEach((item: TreeData) => {
      if (item.title.toLowerCase().indexOf(keyword.toLowerCase()) > -1) {
        result.push({ ...item })
      } else if (item.children) {
        const children: Array<TreeChild> = []
        item.children.forEach((child: TreeChild) => {
          if (child.title.toLowerCase().indexOf(keyword.toLowerCase()) > -1) {
            children.push({ ...child })
          }
        })
        if (children.length) {
          result.push({ ...item, children })
        }
      }
    })
    return result
  }

  const searchList = (keyword: string) => {
    const loop = (data: TreeData[]) => {
      const result: TreeData[] = []
      data.forEach((item: TreeData) => {
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
