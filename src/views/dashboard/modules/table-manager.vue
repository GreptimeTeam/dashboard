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
      a-space(align="center" :size="10")
        a-tooltip(
          v-model:popup-visible="tooltipVisible"
          position="tr"
          mini
          :content="$t('dashboard.hideSidebar')"
        )
          a-button(type="secondary" size="mini" @click="toggleSidebar")
            template(#icon)
              svg.icon.icon-color.rotate-270(:class="{ 'rotate-180': hideSidebar }")
                use(href="#collapse")
  a-spin(style="width: 100%" :loading="tablesLoading")
    .database-selector
      a-select(
        v-model="activeDatabase"
        style="font-weight: 600"
        :data="databaseList"
        :filterable="true"
        :allow-search="true"
        :placeholder="$t('dashboard.searchDatabase')"
        @change="onDatabaseChange"
      ) 
        template(#prefix)
          span.database-label {{ $t('dashboard.database') }}
          span.divider(style="margin-right: 6px") |
        a-option(v-for="db of databaseList" :key="db" :value="db") {{ db }}

    .table-search
      .table-search-left
        a-input.search-table(
          v-model="tablesSearchKey"
          size="mini"
          :allow-clear="true"
          :placeholder="$t('dashboard.input')"
        )
          template(#prefix)
            svg.icon.icon-color
              use(href="#search")
      span.table-total
      | {{ currentTablesCount }} {{ $t('dashboard.tables') }}

    a-tree.table-tree(
      v-if="tablesTreeForDatabase[activeDatabase]?.length"
      v-model:expanded-keys="expandedKeys"
      size="small"
      action-on-node-click="expand"
      :ref="(el) => setRefMap(el, activeDatabase)"
      :block-node="true"
      :data="tablesTreeData"
      :load-more="loadMore"
      :animation="false"
      :virtual-list-props="{ threshold: 100, buffer: 20, height: virtualListHeight }"
    )
      template(#icon="node")
        a-tooltip(v-if="node.node.iconType" :content="node.node.iconType")
          svg.icon
            use(:href="ICON_MAP[node.node.iconType]")
      template(#title="nodeData")
        .tree-data(v-if="!nodeData.isLeaf")
          .data-title(:title="nodeData.title")
            | {{ nodeData.title }}
          TableMenu(
            :nodeData="nodeData"
            :database="activeDatabase"
            :expandedKeys="expandedKeys"
            :expandedTablesTree="expandedTablesTree"
            @expandChildren="expandChildren"
          )
        .tree-data(v-else-if="nodeData.dataType")
          .data-title.columns
            | {{ nodeData.title }}
          .tree-data
            transition(name="slide-fade")
              .data-type {{ nodeData.dataType }}
            TableMenu(
              isColumn
              :nodeData="nodeData"
              :database="activeDatabase"
              :expandedKeys="expandedKeys"
              :expandedTablesTree="expandedTablesTree"
              @expandChildren="expandChildren"
            )
        .detail-row(v-else)
          .count-and-time(v-if="nodeData.title === 'rowAndTime'")
            a-space(:size="4")
              span {{ $t('dashboard.rowCount') }}
              span {{ nodeData.info.rowCount }}
            a-space
              a-space(:size="4")
                span {{ `TTL` }}
                span {{ nodeData.info.ttl }}
              a-button.refresh-details.row-middle(
                type="text"
                size="small"
                :loading="isRefreshingDetails[nodeData.parentKey]"
                @click="loadMore(expandedTablesTree[nodeData.parentKey])"
              )
                template(#icon)
                  svg.icon.icon-color
                    use(href="#refresh")
            a-space(:size="4")
              span.time {{ $t('dashboard.minTime') }}
              a-tooltip(v-if="nodeData.info.min !== '-'" :content="`${nodeData.info.min}`")
                span {{ dateFormatter(nodeData.info.timestampType, nodeData.info.min) }}
              span(v-else) {{ nodeData.info.min }}
            a-space(:size="4")
              span.time {{ $t('dashboard.maxTime') }}
              a-tooltip(v-if="nodeData.info.max !== '-'" :content="`${nodeData.info.max}`")
                span {{ dateFormatter(nodeData.info.timestampType, nodeData.info.max) }}
              span(v-else) {{ nodeData.info.max }}
          a-space(v-else)
            a-space(align="start" :class="{ 'create-table': nodeData.info.sql !== '-' }" :size="4")
              .left
                | {{ $t('dashboard.createTable') }}
                TextCopyable.title-copy.code(
                  :data="nodeData.info.sql"
                  :showData="false"
                  :copyTooltip="$t('dashboard.copyToClipboard')"
                )
              span.empty-sql(v-if="nodeData.info.sql === '-'") {{ nodeData.info.sql }}
              .right(v-else)
                a-typography-text.code-space {{ nodeData.info.sql }}
      template(#switcher-icon="nodeData")
        svg.icon-16.icon-color(v-if="!nodeData.isLeaf")
          use(href="#down")
    EmptyStatus.empty(v-else-if="activeDatabase && !tablesTreeForDatabase[activeDatabase]?.length")
    EmptyStatus.empty(v-else)
</template>

<script lang="ts" setup name="TableManager">
  import usePythonCode from '@/hooks/python-code'
  import useSiderTabs from '@/hooks/sider-tabs'
  import type { TableTreeParent, TreeData } from '@/store/modules/database/types'
  import type { OptionsType } from '@/types/global'
  import { dateFormatter } from '@/utils'

  const props = defineProps<{
    databaseList: string[]
  }>()

  const appStore = useAppStore()
  const { fetchDatabases } = appStore
  const { hideSidebar, database } = storeToRefs(appStore)
  const { insertNameToPyCode } = usePythonCode()
  const { tablesSearchKey, tablesTreeRef, refreshTables, loadMore, loadMoreColumns, isRefreshingDetails } =
    useSiderTabs()
  const { tablesLoading, totalTablesLoading, tablesTreeForDatabase, databaseActiveKeys } = storeToRefs(
    useDataBaseStore()
  )

  const TABLE_NODE_HEIGHT = 34
  const MIN_VIRTUAL_LIST_HEIGHT = 200

  const activeDatabase = ref<string>(database.value || '')
  const expandedKeys = ref<number[]>([])
  const tooltipVisible = ref(false)

  watch(
    () => props.databaseList,
    (newList) => {
      if (newList.length > 0 && !activeDatabase.value) {
        const defaultDb = newList.includes(database.value) ? database.value : newList[0]
        activeDatabase.value = defaultDb
        databaseActiveKeys.value = [defaultDb]
        refreshTables(defaultDb)
      }
    },
    { immediate: true }
  )

  const currentTablesCount = computed(() => {
    return tablesTreeForDatabase.value[activeDatabase.value]?.length || 0
  })

  const setRefMap = (el: any, db: string) => {
    if (!tablesTreeRef.value) {
      tablesTreeRef.value = {}
    }
    tablesTreeRef.value[db] = el
  }

  const refreshTablesTree = async () => {
    if (activeDatabase.value && props.databaseList.includes(activeDatabase.value)) {
      await refreshTables(activeDatabase.value)
    } else if (props.databaseList.length > 0) {
      const targetDb = props.databaseList.includes(database.value) ? database.value : props.databaseList[0]
      activeDatabase.value = targetDb
      databaseActiveKeys.value = [targetDb]
      await refreshTables(targetDb)
    } else {
      await fetchDatabases()
    }
  }

  const onDatabaseChange = async (db: string) => {
    tablesSearchKey.value = ''
    expandedKeys.value = []
    activeDatabase.value = db
    databaseActiveKeys.value = [db]
    if (!tablesTreeForDatabase.value[db]) {
      await refreshTables(db)
    } else if (tablesTreeRef.value && tablesTreeRef.value[db]) {
      tablesTreeRef.value[db].expandAll(false)
    }
  }

  const expandedTablesTree = computed(() => {
    return tablesTreeForDatabase.value[activeDatabase.value] || []
  })

  const tablesTreeData = computed(() => {
    if (!tablesSearchKey.value) return expandedTablesTree.value
    return expandedTablesTree.value.filter(
      (item: TableTreeParent) => item.title.toLowerCase().indexOf(tablesSearchKey.value.toLowerCase()) > -1
    )
  })

  const virtualListHeight = computed(() => {
    const maxHeight = `calc(100vh - var(--tables-header-height) - var(--footer-height))`
    return maxHeight
  })

  const expandChildren = (event: Event, nodeData: TableTreeParent, type: 'details' | 'columns') => {
    expandedKeys.value.push(nodeData.key)
    nodeData.children = nodeData[type]
    nodeData.childrenType = type
    loadMore(nodeData)
  }

  const clickMenu = (event: Event, nodeData: TableTreeParent, db: string) => {
    event.stopPropagation()
    if (!nodeData.columns.length) {
      loadMoreColumns(nodeData, false, db)
    }
  }

  const ICON_MAP: { [key: string]: string } = {
    FIELD: '#value',
    TAG: '#primary-key',
    TIMESTAMP: '#time-index',
  }

  const toggleSidebar = () => {
    tooltipVisible.value = false
    hideSidebar.value = !hideSidebar.value
  }
</script>

<style scoped lang="less">
  :deep(.arco-select-view-single .arco-select-view-prefix) {
    color: var(--small-font-color);
    padding-right: 0px;
  }
  .arco-card.table-manager {
    background: var(--card-bg-color);
    border-radius: 10px;
    padding: 0;
    height: 100%;

    :deep(.arco-tree.table-tree) {
      .arco-tree-node {
        border: none;
        > .arco-tree-node-title {
          margin-left: 2px;
        }
        &:not(.arco-tree-node-is-leaf) {
          > .arco-tree-node-title {
            padding: 2px 0;
          }
        }
        &.arco-tree-node-is-leaf.arco-tree-node-is-tail {
          margin-bottom: 0;
        }
      }
      .icon-16 {
        height: 14px;
        width: 14px;
      }
      .icon {
        height: 13px;
        width: 13px;
      }
    }
    .arco-space.table-buttons {
      > .arco-space-item:nth-of-type(1) {
        display: none;
      }
      > .arco-space-item:nth-of-type(2) {
        display: none;
      }
      > .arco-space-item:nth-of-type(3) {
        margin-right: 0;
        .arco-btn-size-small.arco-btn-only-icon {
          width: 24px;
          height: 24px;
        }
      }
    }

    .title-copy {
      .arco-btn-size-medium.arco-btn-only-icon {
        width: 24px;
        height: 24px;
      }
      .arco-typography-operation-copy,
      .arco-typography-operation-copied {
        display: flex;
      }
      &.columns {
        margin-left: 0;
      }
    }
    .arco-btn-size-small.arco-btn-only-icon {
      width: 24px;
      height: 24px;
    }

    :deep(> .arco-card-header) {
      padding: 10px 6px 10px 15px;

      > .arco-card-header-title {
        justify-content: space-between;
        gap: 20px;
      }
    }

    .count-and-time {
      width: 100%;

      .row-end {
        display: none;
      }

      > .arco-space {
        min-height: 24px;

        &:nth-of-type(1) {
          width: 50%;
        }
        &:nth-of-type(2) {
          width: 50%;
        }

        &:nth-of-type(2) {
          justify-content: space-between;
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
      padding: 0px 0px 0 18px;
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
      .menu-button {
        display: flex;
      }
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
              color: var(--main-font-color);
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
    cursor: pointer;

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
    line-height: 24px;
    display: flex;
  }

  .empty-sql {
    color: var(--small-font-color);
    line-height: 24px;
  }

  .right {
    background: var(--th-bg-color);
    border-radius: 6px;
    border: 1px solid var(--border-color);
    padding: 0 0 4px 10px;
    font-family: var(--font-mono);

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
      :deep(.arco-btn-text.arco-btn-only-icon) {
        .icon {
          width: 14px;
          height: 14px;
        }
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
  }

  .arco-dropdown-open {
    .icon-color {
      color: var(--brand-color);
    }
  }

  :deep(.arco-space.search) {
    .arco-space-item {
      justify-content: flex-end;
    }
  }
  .database-selector {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 8px 16px;

    .database-label {
      margin-right: 8px;
      white-space: nowrap;
      font-weight: normal;
    }
  }
  .table-search {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 2px 16px 16px 16px;
    border-bottom: 1px solid var(--border-color);
    margin-bottom: 8px;
  }

  .arco-input-wrapper.search-table {
    padding: 0 10px;
    font-family: 'Open Sans';

    :deep(> .arco-input-prefix) {
      padding-right: 10px;
    }

    :deep(> .arco-input-suffix) {
      padding-left: 8px;
    }
  }

  .table-total {
    margin-left: 12px;
    font-size: 12px;
    color: var(--third-font-color);
    white-space: nowrap;
    word-break: keep-all;
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
        background-color: var(--list-hover-color);
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
</style>
