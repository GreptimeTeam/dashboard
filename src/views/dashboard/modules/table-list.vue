<template lang="pug">
a-spin(style="width: 100%" :loading="tablesLoading")
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
      v-if="tablesTreeData && tablesTreeData.length > 0"
      ref="treeRef"
      size="small"
      :block-node="true"
      :data="tablesTreeData"
      :load-more="loadMore"
      :animation="false"
    )
      template(#icon="node")
        svg.icon-16(v-if="node.node.iconType")
          use(:href="ICON_MAP[node.node.iconType]")
      template(#title="nodeData")
        .tree-data
          .data-title(v-if="nodeData.iconType")
            | {{ nodeData.title }}
          .div(v-if="nodeData.iconType")
            transition(name="slide-fade")
              .data-type {{ nodeData.dataType }}
          a-tooltip.data-type(v-if="!nodeData.iconType" mini :content="nodeData.title")
            .data-title
              | {{ nodeData.title }}
      template(#switcher-icon)
        IconDown
      template(#extra="nodeData")
        a-tooltip(mini :content="$t('dashboard.insertName')")
          svg.icon-15.pointer(name="copy" @click="insertName(nodeData.title)")
            use(href="#copy")
    a-empty(v-else)
      template(#image)
        svg.icon-32
          use(href="#empty")
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
  const { tablesLoading } = storeToRefs(useDataBaseStore())
  const { getTableByName, getTables, addChildren } = useDataBaseStore()

  const treeRef = ref()

  const refreshTables = () => {
    tablesSearchKey.value = ''
    getTables()
    if (treeRef.value) treeRef.value.expandAll(false)
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

<style scoped lang="less">
  .slide-fade-enter-active {
    transition: all 0.3s ease-out;
  }

  .slide-fade-leave-active {
    transition: all 0.8s cubic-bezier(1, 0.5, 0.8, 1);
  }

  .slide-fade-enter-from,
  .slide-fade-leave-to {
    transform: translateX(20px);
    opacity: 0;
  }
</style>
