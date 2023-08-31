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
          a-dropdown.menu-dropdown(trigger="click" position="right" @click="(event) => clickMenu(event, nodeData)")
            a-button.menu-button(type="text")
              template(#icon)
                icon-more.icon-18
            template(#content)
              a-doption(v-for="item of SHORTCUT_MAP[nodeData.iconType || 'TABLE']" v-show="route.name === 'query'")
                a-spin(style="width: 100%" :loading="nodeData.children && !nodeData.children.length")
                  ShortCut(
                    :type="item.value"
                    :node="nodeData"
                    :parent="nodeData.iconType ? originTablesTree[nodeData.parentKey] : nodeData"
                    :label="item.label"
                  )
              a-doption
                a-tooltip(content="Copy to Clipboard")
                  a-button(type="text" @click="copy(nodeData.title)") Copy name
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
  import type { TableTreeChild, TableTreeParent } from '@/store/modules/database/types'
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

  const loadMore = (nodeData: TableTreeParent) => {
    return new Promise<void>((resolve, reject) => {
      getTableByName(nodeData.title)
        .then((result: any) => {
          const { output } = result
          const {
            records: { rows },
          } = output[0]
          const treeChildren: TableTreeChild[] = []
          let timeIndexName = '%TIMESTAMP%'
          rows.forEach((row: string[]) => {
            // row[0]: "Column" (column name),
            // row[1]: "Type" (data type),
            // row[2]: "Key" (`PRI` means primary key),
            // row[3]: "Null",
            // row[4]: "Default",
            // row[5]: "Semantic Type" (used as icon type, including `TAG`, `FIELD`, `TIMESTAMP`),
            if (row[5] === 'TIMESTAMP') {
              timeIndexName = row[0]
            }
            treeChildren.push({
              title: row[0],
              key: `${nodeData.title}.${row[0]}`,
              isLeaf: true,
              dataType: row[1],
              iconType: row[5],
              parentKey: nodeData.key,
            })
          })
          addChildren(nodeData.key, treeChildren, timeIndexName)
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

  // Deprecated
  const insertName = (name: string) => {
    const routeName = route.name as string
    return INSERT_MAP[routeName](name)
  }

  const ICON_MAP: { [key: string]: string } = {
    FIELD: '#value',
    TAG: '#primary-key',
    TIMESTAMP: '#time-index',
  }

  const SHORTCUT_MAP: { [key: string]: OptionsType[] } = {
    TABLE: [{ value: 'select*100', label: 'Query table' }],
    FIELD: [
      { value: 'select100', label: 'Query column' },
      {
        value: 'max',
        label: 'Query max',
      },
      {
        value: 'min',
        label: 'Query min',
      },
    ],
    TAG: [
      { value: 'count', label: 'Count by' },
      { value: 'where=', label: 'Filter by' },
    ],
    TIMESTAMP: [
      { value: 'select*100', label: 'Query table' },
      {
        value: 'where<',
        label: 'Filter by',
      },
    ],
  }

  const clickMenu = (event: Event, nodeData: TableTreeParent) => {
    if (nodeData.children && expandedKeys.value?.includes(nodeData.key)) {
      event.stopPropagation()
    }
  }

  const SHORTCUT_MAP: { [key: string]: OptionsType[] } = {
    'TABLE': [{ value: 'select*100', label: 'Query table' }],
    'FIELD': [
      { value: 'select100', label: 'Query column' },
      {
        value: 'max',
        label: 'Query max',
      },
      {
        value: 'min',
        label: 'Query min',
      },
    ],
    'PRIMARY KEY': [
      { value: 'count', label: 'Count by' },
      { value: 'where=', label: 'Filter by' },
    ],
    'TIME INDEX': [
      { value: 'select*100', label: 'Query table' },
      {
        value: 'where<',
        label: 'Filter by',
      },
    ],
  }

  const clickMenu = (event: Event, nodeData: TableTreeParent) => {
    if (nodeData.children && expandedKeys.value?.includes(nodeData.key)) {
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
