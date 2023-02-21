<template lang="pug">
a-space.search-space
  a-input(v-model="tablesSearchKey" :allow-clear="true")
    template(#prefix)
      svg.icon
        use(href="#search")
  .icon-space.pointer(@click="refreshTables")
    svg.icon
      use(href="#refresh")
a-scrollbar.tree-scrollbar
  a-tree.table-tree(ref="treeRef" :data="tablesTreeData" :load-more="loadMore" size="small" :animation="false" )
    template(#title)
    template(#switcher-icon)
      IconDown
    template(#extra="nodeData")
      img(:src="getIconUrl(nodeData.iconType)" alt="" height="14")
      span.tree-title
        | {{ nodeData.title }}
      span.data-type
        | {{ nodeData.dataType }}
      a-tooltip(:content="$t('dataExplorer.insertName')" mini)
        svg.icon.copy-icon.pointer(name="copy" @click="insertName(nodeData.title)")
          use(href="#copy")
</template>

<script lang="ts" setup>
  import { storeToRefs } from 'pinia'
  import { useDataBaseStore, useAppStore } from '@/store'
  import useDataExplorer from '@/hooks/data-explorer'
  import usePythonCode from '@/hooks/python-code'
  import useSiderTabs from '@/hooks/sider-tabs'

  const { insertNameToCode } = useDataExplorer()
  const { codeType, guideModal } = storeToRefs(useAppStore())
  const { insertNameToPyCode } = usePythonCode()
  const { tablesSearchKey, tablesTreeData } = useSiderTabs()

  const { getTableByName, getTables, addChildren } = useDataBaseStore()
  const { originTablesTree } = storeToRefs(useDataBaseStore())

  const treeRef = ref()

  const refreshTables = () => {
    tablesSearchKey.value = ''
    getTables()
    treeRef.value.expandAll(false)
  }

  const loadMore = (nodeData: any) => {
    return new Promise<void>((resolve, reject) => {
      getTableByName(nodeData.title)
        .then((result: any) => {
          const { output } = result
          const {
            records: { rows },
          } = output[0]
          const rowArray: any = []
          rows.forEach((row: any) => {
            // TODO: make code more readable
            rowArray.push({
              title: row[0],
              key: row[0],
              isLeaf: true,
              dataType: row[1],
              iconType: row[4],
            })
          })
          // nodeData.children = rowArray
          addChildren(nodeData.key, rowArray)
          resolve()
        })
        .catch(() => {
          reject()
        })
    })
  }

  const insertName = (name: string) => {
    return codeType.value === 'sql' ? insertNameToCode(name) : insertNameToPyCode(name)
  }

  const ICON_MAP: { [key: string]: string } = {
    'VALUE': 'value-icon.png',
    'PRIMARY KEY': 'key-icon.png',
    'TIME INDEX': 'time-icon.png',
  }
  // TODO: Better use iconPark.
  const getIconUrl = (type: any) => {
    return new URL(`../../../assets/images/${ICON_MAP[type]}`, import.meta.url).href
  }
</script>
