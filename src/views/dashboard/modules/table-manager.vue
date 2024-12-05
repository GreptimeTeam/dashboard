<template lang="pug">
a-card.table-manager(:bordered="false")
  template(#title)
    a-space(:size="10")
      | Tables
      a-button(
        type="outline"
        size="small"
        :loading="totalTablesLoading"
        @click="refreshTablesTree()"
      )
        template(#icon)
          svg.icon.brand-color
            use(href="#refresh")
    a-space
      a-input.search-table(v-model="tablesSearchKey" :allow-clear="true" :placeholder="$t('dashboard.input')")
        template(#prefix)
          svg.icon.icon-color
            use(href="#search")
  a-spin(style="width: 100%" :loading="tablesLoading")
    a-collapse.databases(
      v-model:active-key="databaseActiveKeys"
      accordion
      :bordered="false"
      @change="onCollapseChange"
    )
      template(#expand-icon="{ active }")
        svg.icon.icon-color(v-if="active")
          use(href="#down")
        svg.icon.icon-color.rotate-270(v-else)
          use(href="#down")
      a-collapse-item(v-for="database of databaseList" :key="database")
        template(#header)
          a-space(:size="10")
            | {{ database }}
        a-tree.table-tree(
          v-if="tablesTreeForDatabase[database]?.length"
          v-model:expanded-keys="expandedKeys"
          size="small"
          action-on-node-click="expand"
          :ref="(el: refItem) => setRefMap(el, database)"
          :block-node="true"
          :data="tablesTreeData"
          :load-more="loadMore"
          :animation="false"
          :virtual-list-props="{threshold:10, height: `calc(100vh - ${collapseHeadersHeight}px - var(--tables-header-height) - var(--footer-height))` }"
        )
          template(#icon="node")
            a-tooltip(v-if="node.node.iconType" :content="node.node.iconType")
              svg.icon
                use(:href="ICON_MAP[node.node.iconType]")
          template(#title="nodeData")
            .tree-data(v-if="!nodeData.isLeaf")
              a-tooltip.data-type(mini :content="nodeData.title")
                .data-title
                  | {{ nodeData.title }}
              a-space.table-buttons(:size="0" :id="`table-${nodeData.key}`")
                a-space(v-for="item of SHORTCUT_MAP['TABLE']" @click.stop)  
                  ShortCut(
                          :type="item.value"
                          :node="nodeData"
                          :parent="nodeData.iconType ? expandedTablesTree[nodeData.parentKey] : nodeData"
                          :label="''"
                          :database="database"
                        )
                TextCopyable.title-copy(
                  type="text"
                  :data="nodeData.title"
                  :show-data="false"
                  @click.stop
                )
            .tree-data(v-else-if="nodeData.dataType")
              .data-title.columns
                | {{ nodeData.title }}
              .tree-data
                transition(name="slide-fade")
                  .data-type {{ nodeData.dataType }}
                a-dropdown.quick-select(v-if="nodeData.dataType" trigger="click" position="right")
                  a-tooltip(mini :content="$t('dashboard.quickSelect')")
                    a-button(type="text" size="small")
                      template(#icon)
                        svg.icon-16.icon-color
                          use(href="#query")
                  template(#content)
                    a-doption(v-for="item of SHORTCUT_MAP[nodeData.iconType || 'TABLE']")
                      a-spin(style="width: 100%" :loading="nodeData.columns && !nodeData.columns.length")
                        ShortCut(
                          :type="item.value"
                          :node="nodeData"
                          :parent="nodeData.iconType ? expandedTablesTree[nodeData.parentKey] : nodeData"
                          :label="item.label"
                          :database="database"
                        )
                TextCopyable.title-copy.columns(
                  type="text"
                  :data="nodeData.title"
                  :show-data="false"
                  @click.stop
                )
          template(#switcher-icon="nodeData")
            svg.icon-16.icon-color(v-if="!nodeData.isLeaf")
              use(href="#down")
        EmptyStatus.empty(v-else)
</template>

<script lang="ts" setup name="TableManager">
  import usePythonCode from '@/hooks/python-code'
  import useSiderTabs from '@/hooks/sider-tabs'
  import type { TableTreeParent, TreeData } from '@/store/modules/database/types'
  import type { OptionsType } from '@/types/global'
  import { dateFormatter } from '@/utils'

  const { databaseList, database: storeDB } = storeToRefs(useAppStore())
  const { insertNameToPyCode } = usePythonCode()
  const { tablesSearchKey, tablesTreeRef, refreshTables, loadMore, loadMoreColumns } = useSiderTabs()
  const { tablesLoading, totalTablesLoading, tablesTreeForDatabase, databaseActiveKeys } = storeToRefs(
    useDataBaseStore()
  )
  const { fetchDatabases } = useAppStore()

  const collapseHeadersHeight = computed(() => databaseList.value.length * 36)

  const expandedKeys = ref<number[]>()

  const setRefMap = (el: any, database: string) => {
    if (!tablesTreeRef.value) {
      tablesTreeRef.value = {}
    }
    tablesTreeRef.value[database] = el
  }

  const refreshTablesTree = async () => {
    if (databaseActiveKeys.value[0]) {
      await refreshTables(databaseActiveKeys.value[0])
    } else {
      await fetchDatabases()
    }
  }

  const onCollapseChange = async (key: string[]) => {
    const database = key[0]
    tablesSearchKey.value = ''
    if (database) {
      if (!tablesTreeForDatabase.value[database]) {
        await refreshTables(database)
        return
      }
    }

    if (tablesTreeRef.value && tablesTreeRef.value[database]) {
      tablesTreeRef.value[database].expandAll(false)
    }
  }

  const expandedTablesTree = computed(() => {
    return tablesTreeForDatabase.value[databaseActiveKeys.value[0]] || []
  })

  const tablesTreeData = computed(() => {
    if (!tablesSearchKey.value) return expandedTablesTree.value
    return expandedTablesTree.value.filter(
      (item: TableTreeParent) => item.title.toLowerCase().indexOf(tablesSearchKey.value.toLowerCase()) > -1
    )
  })

  const expandChildren = (event: Event, nodeData: TableTreeParent, type: 'details' | 'columns') => {
    if (nodeData[type].length && type !== nodeData.childrenType && expandedKeys.value?.includes(nodeData.key)) {
      event.stopPropagation()
    }

    nodeData.children = nodeData[type]
    // If children is empty, trigger load-more
    nodeData.childrenType = type
  }

  const gridColumns = computed(() => {
    return tablesTreeData.value.map((data: TreeData) => {
      return {
        title: data.title,
        dataIndex: data.title,
      }
    })
  })

  const clickMenu = (event: Event, nodeData: TableTreeParent, database: string) => {
    event.stopPropagation()
    if (!nodeData.columns.length) {
      loadMoreColumns(nodeData, false, database)
    }
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
</script>

<style scoped lang="less">
  .arco-card.table-manager {
    background: var(--card-bg-color);
    border-radius: 10px;
    padding: 0;
    height: 100%;

    :deep(> .arco-card-header) {
      padding: 15px 20px;
      border-bottom: 1px solid var(--border-color);

      > .arco-card-header-title {
        justify-content: space-between;
      }
    }

    &.big {
      .count-and-time {
        display: flex;
        width: 100%;
        justify-content: space-between;

        .row-middle {
          display: none;
        }

        > .arco-space {
          height: 28px;
        }
      }
    }

    &.small {
      .count-and-time {
        width: 100%;

        .row-end {
          display: none;
        }

        > .arco-space {
          width: 50%;
          height: 28px;

          &:nth-of-type(2) {
            justify-content: space-between;
          }
        }
      }
    }
  }

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
    padding-right: 2px;

    &::-webkit-scrollbar {
      width: 8px;
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

  .arco-typography {
    display: inline-flex;
    white-space: pre-wrap;
    color: var(--small-font-color);
    background-color: transparent;
    border: 0;
    border-radius: 4px;
  }

  .detail {
    justify-content: flex-start;
    padding-right: 60px;

    .right {
      padding-left: 50px;
    }
  }

  .table-tree {
    :deep(.arco-tree-node) {
      padding: 0 12px 0 20px;
      line-height: 30px;
      border-radius: 0;

      .arco-icon-loading {
        color: var(--brand-color);
        height: 18px;
        width: 18px;
      }
    }
    :deep(.arco-tree-node:hover) {
      background-color: transparent;
    }
    :deep(.arco-tree-node:not(.arco-tree-node-is-leaf)) {
      &:not(:first-of-type) {
        border-top: 1px solid var(--border-color);
      }

      border-radius: 0;

      .arco-tree-node-title {
        padding: 7px 0;
      }
    }

    :deep(.arco-tree-node.arco-tree-node-is-leaf) {
      .arco-tree-node-title {
        padding: 0;
        border-radius: 0;
      }
    }

    :deep(.arco-tree-node.arco-tree-node-is-leaf:hover) {
      background: var(--tree-select-brand-color);
    }

    :deep(.arco-tree-node:last-of-type) {
      border-bottom: 1px solid var(--border-color);

      &.arco-tree-node-is-leaf {
        padding-bottom: 8px;
      }
    }

    :deep(.arco-tree-node.arco-tree-node-is-leaf.details) {
      cursor: default;

      .arco-tree-node-title {
        border: none;
        margin-left: 10px;
      }

      .detail-row {
        font-size: 11px;
        line-height: 18px;
        display: flex;
        justify-content: space-between;

        > .count-and-time {
          > .arco-space {
            .arco-space-item:first-of-type {
              color: var(--third-font-color);
            }

            .arco-space-item:nth-of-type(2) {
              color: var(--small-font-color);
            }
          }
        }
      }
    }

    :deep(.arco-tree-node.arco-tree-node-is-leaf.details:hover) {
      background: transparent;
    }

    :deep(.arco-tree-node.arco-tree-node-is-leaf.arco-tree-node-is-tail) {
      margin-bottom: 8px;
    }
  }

  .data-title {
    padding-left: 0;
    font-size: 13px;
    line-height: 30px;

    &.columns {
      color: var(--small-font-color);
      padding-left: 8px;
    }
  }

  .create-table {
    flex-direction: column;
  }

  .left {
    color: var(--third-font-color);
    line-height: 28px;
  }

  .empty-sql {
    color: var(--small-font-color);
    line-height: 28px;
  }

  .right {
    display: flex;
    background: var(--th-bg-color);
    border-radius: 6px;
    border: 1px solid var(--border-color);
    padding: 0 0 4px 10px;
    font-family: monospace;

    .code-space {
      padding-top: 6px;
      font-size: 11px;
    }

    .icon {
      width: 14px;
      height: 14px;
    }
  }

  :deep(.arco-tree-node-switcher) {
    width: 16px;
  }

  :deep(.arco-tree-node-title) {
    margin-left: 10px;
  }

  .title-copy {
    &.columns {
      margin-left: 6px;
    }

    :deep(.arco-typography-operation-copy),
    :deep(.arco-typography-operation-copied) {
      margin-left: 0;
      padding: 0;
    }

    :deep(.icon) {
      width: 16px;
      height: 16px;
    }

    &.code {
      :deep(.icon) {
        width: 14px;
        height: 14px;
      }
    }

    :deep(.arco-btn-size-medium.arco-btn-only-icon) {
      width: 28px;
      height: 28px;
    }
  }

  .code-copy {
    :deep(.icon) {
      width: 14px;
      height: 14px;
    }
  }

  .empty {
    display: flex;
    align-items: center;
    justify-content: center;
    flex-direction: column;
    height: 50vh;
  }

  .arco-dropdown-open {
    .icon-color {
      color: var(--brand-color);
    }
  }

  .arco-input-wrapper.search-table {
    padding: 0 10px;
    font-family: 'Open Sans';
    width: calc(100% - 15px);

    :deep(> .arco-input-prefix) {
      padding-right: 10px;
    }
  }

  .arco-card.table-manager:not(.query-tables) {
    .arco-tree-node-switcher-icon {
      width: 16px;

      svg {
        transform: rotate(0);
      }
    }
  }
</style>

<style lang="less">
  .quick-select {
    .arco-dropdown-option {
      padding: 0;
    }

    .arco-dropdown .arco-btn-text[type='button'] {
      border-radius: 0;

      &:hover {
        background-color: var(--main-bg-color);
      }
    }

    &.columns {
      margin-right: 6px;
    }

    .arco-btn-text[type='button'] {
      justify-content: start;
      width: 100%;
      color: var(--small-font-color);
      font-size: 13px;
    }

    .arco-btn-text[type='button']:hover {
      background-color: var(--grey-bg-color);
    }
  }

  .arco-collapse.arco-collapse-borderless.databases {
    border-radius: 0;

    > .arco-collapse-item-active {
      .arco-collapse-item-header {
        background: var(--th-bg-color);
      }
    }

    .arco-collapse-item-header {
      padding-top: 4px;
      border: none;
      padding-bottom: 4px;

      .arco-collapse-item-header-title {
        font-size: 13px;
      }
    }

    .arco-collapse-item-content-box {
      padding: 0;
    }

    .arco-collapse-item-content {
      padding-right: 0px;
      padding-left: 0;
      background: transparent;
    }

    .arco-collapse-item-header-left {
      padding-left: 24px;
      background: var(--th-bg-color);
    }

    .arco-collapse-item .arco-collapse-item-icon-hover {
      left: 6px;
    }

    .arco-collapse-item {
      border: none;
      padding-bottom: 2px;
    }
  }
</style>
