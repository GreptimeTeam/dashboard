<template lang="pug">
a-spin(style="width: 100%" :loading="tablesLoading")
  a-space.search-space
    a-input(v-model="tablesSearchKey" :allow-clear="true")
      template(#prefix)
        svg.icon.icon-color
          use(href="#search")
    a-button(type="outline" size="small" @click="refreshTables")
      template(#icon)
        svg.icon.brand-color
          use(href="#refresh")
  a-tree.table-tree(
    v-if="tablesTreeData && tablesTreeData.length > 0"
    ref="treeRef"
    v-model:expanded-keys="expandedKeys"
    size="small"
    action-on-node-click="expand"
    :block-node="true"
    :data="tablesTreeData"
    :animation="false"
    :load-more="loadMore"
    :virtual-list-props="{ height: 'calc(100vh - 160px)' }"
    :field-names="{ children: 'columns' }"
    :default-expand-all="false"
  )
    template(#icon="node")
      a-tooltip(:content="node.node.iconType")
        svg.icon(v-if="node.node.iconType")
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
              a-doption
                a-tooltip(content="Copy to Clipboard")
                  a-button(type="text" @click="copy(nodeData.title)") Copy name
    template(#switcher-icon)
      IconDown
  EmptyStatus.empty(v-else)
</template>

<script lang="ts" setup name="TableList">
  import { storeToRefs } from 'pinia'
  import { useDataBaseStore } from '@/store'
  import usePythonCode from '@/hooks/python-code'
  import useSiderTabs from '@/hooks/sider-tabs'
  import type { TableTreeParent } from '@/store/modules/database/types'
  import type { OptionsType } from '@/types/global'
  import { useClipboard } from '@vueuse/core'

  const source = ref('')
  const { copy } = useClipboard({ source })
  const { insertNameToPyCode } = usePythonCode()
  const { tablesSearchKey, tablesTreeData, loadMoreColumns: loadMore } = useSiderTabs()
  const { tablesLoading } = storeToRefs(useDataBaseStore())
  const { getTables } = useDataBaseStore()

  const treeRef = ref()
  const expandedKeys = ref<number[]>()

  onActivated(() => {
    treeRef.value?.scrollIntoView({ top: 0 })
  })

  const refreshTables = () => {
    tablesSearchKey.value = ''
    getTables()
    if (treeRef.value) treeRef.value.expandAll(false)
  }

  const INSERT_MAP: { [key: string]: any } = {
    scripts: insertNameToPyCode,
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
