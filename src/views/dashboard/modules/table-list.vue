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
  a-tree.table-tree(
    v-if="tablesTreeData && tablesTreeData.length > 0"
    ref="treeRef"
    v-model:expanded-keys="expandedKeys"
    size="small"
    action-on-node-click="expand"
    :block-node="true"
    :data="tablesTreeData"
    :load-more="loadMore"
    :animation="false"
    :virtual-list-props="{ height: 'calc(100vh - 220px)' }"
  )
    template(#icon="node")
      a-tooltip(:content="node.node.iconType")
        svg.icon-16(v-if="node.node.iconType")
          use(:href="ICON_MAP[node.node.iconType]")
    template(#title="nodeData")
      .tree-data
        a-tooltip.data-type(v-if="!nodeData.iconType" mini :content="nodeData.title")
          .data-title
            | {{ nodeData.title }}
        .data-title(v-else)
          | {{ nodeData.title }}
        .tree-data
          .div(v-if="nodeData.iconType")
            transition(name="slide-fade")
              .data-type {{ nodeData.dataType }}
          a-dropdown(trigger="click" position="right" @click="(event) => clickMenu(event, nodeData)")
            a-button.menu-button(type="text")
              template(#icon)
                icon-more.icon-18
            template(#content)
              a-doption(v-for="item of SHORTCUT_MAP[nodeData.iconType || 'TABLE']")
                a-spin(:loading="nodeData.children && !nodeData.children.length")
                  ShortCut(
                    :type="item.value"
                    :node="nodeData"
                    :parent="originTablesTree[nodeData.parentKey]"
                    :label="item.label"
                  )
              a-doption
                a-button(type="text" @click="copy(nodeData.title)") Copy To Clipboard
    template(#switcher-icon)
      IconDown
  .tree-scrollbar(v-else)
    EmptyStatus
</template>

<script lang="ts" setup>
  import { storeToRefs } from 'pinia'
  import { useDataBaseStore, useAppStore } from '@/store'
  import useQueryCode from '@/hooks/query-code'
  import usePythonCode from '@/hooks/python-code'
  import useSiderTabs from '@/hooks/sider-tabs'
  import type { TreeChild, TreeData } from '@/store/modules/database/types'
  import type { OptionsType } from '@/types/global'
  import { useClipboard } from '@vueuse/core'

  const source = ref('')
  const { text, copy, copied, isSupported } = useClipboard({ source })
  const route = useRoute()
  const { insertNameToQueryCode } = useQueryCode()
  const { insertNameToPyCode } = usePythonCode()
  const { tablesSearchKey, tablesTreeData } = useSiderTabs()
  const { tablesLoading, originTablesTree } = storeToRefs(useDataBaseStore())
  const { getTableByName, getTables, addChildren } = useDataBaseStore()

  const treeRef = ref()
  const expandedKeys = ref<number[]>()

  const refreshTables = () => {
    tablesSearchKey.value = ''
    getTables()
    if (treeRef.value) treeRef.value.expandAll(false)
  }

  const loadMore = (nodeData: TreeData) => {
    return new Promise<void>((resolve, reject) => {
      getTableByName(nodeData.title)
        .then((result: any) => {
          const { output } = result
          const {
            records: { rows },
          } = output[0]
          const treeChildren: TreeChild[] = []
          let timeIndexName = '%TIME_INDEX%'
          rows.forEach((row: string[]) => {
            // row[0]: "Field" (field name),
            // row[1]: "Type" (data type),
            // row[2]: "Null",
            // row[3]: "Default",
            // row[4]: "Semantic Type",
            if (row[4] === 'TIME INDEX') {
              timeIndexName = row[0]
            }
            treeChildren.push({
              title: row[0],
              key: `${nodeData.title}.${row[0]}`,
              isLeaf: true,
              dataType: row[1],
              iconType: row[4],
              parentKey: nodeData.key as number,
            })
          })
          addChildren(nodeData.key as number, treeChildren, timeIndexName)
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

  const SHORTCUT_MAP: { [key: string]: OptionsType[] } = {
    'TABLE': [{ value: 'select*100', label: 'SELECT * 100' }],
    'FIELD': [
      { value: 'select100', label: 'SELECT 100' },
      {
        value: 'max',
        label: 'MAX',
      },
      {
        value: 'min',
        label: 'MIN',
      },
    ],
    'PRIMARY KEY': [
      { value: 'count', label: 'COUNT' },
      { value: 'where=', label: 'WHERE =' },
    ],
    'TIME INDEX': [
      { value: 'select*100', label: 'SELECT * 100' },
      {
        value: 'where<',
        label: 'WHERE <',
      },
    ],
  }

  const clickMenu = (event: Event, nodeData: TreeData) => {
    if (nodeData.children && expandedKeys.value?.includes(nodeData.key as number)) {
      event.stopPropagation()
    }
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
  :deep(.arco-virtual-list) {
    padding-right: 3px;
    &::-webkit-scrollbar {
      width: 10px;
    }
    &::-webkit-scrollbar-thumb {
      background-color: #c9cdd4;
      border-radius: 6px;
    }
    &::-webkit-scrollbar-thumb:hover {
      background-color: #86909c;
    }

    overflow-y: scroll !important;
    // Firefox
    scrollbar-color: #c9cdd4 var(--card-bg-color);
  }

  .table-tree {
    margin-right: 3px;
  }
</style>
