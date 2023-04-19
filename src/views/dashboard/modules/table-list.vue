<template lang="pug">
a-space(direction="vertical" size="medium" fill)
  a-space.search-space
    a-input(v-model="tablesSearchKey" :allow-clear="true")
      template(#prefix)
        svg.icon
          use(href="#search")
    .icon-space.pointer(@click="refreshTables")
      svg.icon
        use(href="#refresh")
  a-scrollbar.tree-scrollbar
    a-tree.table-tree(
      ref="treeRef"
      size="small"
      :data="tablesTreeData"
      :load-more="loadMore"
      :animation="false"
    )
      template(#title)
      template(#switcher-icon)
        IconDown
      template(#extra="nodeData")
        svg.icon-16(v-show="nodeData.iconType")
          use(:href="ICON_MAP[nodeData.iconType]")
        .tree-data
          a-typography-text.data-title(:ellipsis="{ rows: 1, showTooltip: true }") {{ nodeData.title }}
          .data-type {{ nodeData.dataType }}
        a-tooltip(mini :content="$t('dataExplorer.insertName')")
          svg.icon-15.copy-icon.pointer(name="copy" @click="insertName(nodeData.title)")
            use(href="#copy")
</template>

<script lang="ts" setup>
  import { storeToRefs } from 'pinia'
  import { useDataBaseStore, useAppStore } from '@/store'
  import useQueryCode from '@/hooks/query-code'
  import usePythonCode from '@/hooks/python-code'
  import useSiderTabs from '@/hooks/sider-tabs'

  const route = useRoute()
  const { insertNameToQueryCode } = useQueryCode()
  const { insertNameToPyCode } = usePythonCode()
  const { tablesSearchKey, tablesTreeData } = useSiderTabs()

  const { getTableByName, getTables, addChildren } = useDataBaseStore()

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
              key: `${nodeData.title}.${row[0]}`,
              isLeaf: true,
              dataType: row[1],
              iconType: row[4],
            })
          })
          addChildren(nodeData.key, rowArray)
          resolve()
        })
        .catch(() => {
          reject()
        })
    })
  }

  const INSERT_MAP: { [key: string]: any } = {
    query: insertNameToQueryCode,
    scripts: insertNameToPyCode,
  }

  const insertName = (name: string) => {
    const routeName = route.name as string
    return INSERT_MAP[routeName](name)
  }

  const ICON_MAP: { [key: string]: string } = {
    'FIELD': '#value',
    'PRIMARY KEY': '#primary-key',
    'TIME INDEX': '#time-index',
  }
</script>
