<template lang="pug">
a-card.table-manager.gpt-page-sidebar.gpt-sidebar-header-card.gpt-table-sidebar-card(:bordered="false")
  template(#title)
    a-space.table-sidebar-title(fill :size="10")
      span.gpt-sidebar-heading {{ $t('tables.sidebar.title') }}
      a-button.table-sidebar-refresh(
        type="text"
        size="mini"
        :loading="totalTablesLoading"
        @click="refreshTablesTree()"
      )
        template(#icon)
          svg.icon-11.brand-color
            use(href="#refresh")
  a-spin(style="width: 100%" :loading="tablesLoading")
    .gpt-table-sidebar-header
      .gpt-table-sidebar-header__label {{ $t('dashboard.database') }}
      .gpt-table-sidebar-header__control
        a-select.table-sidebar-db(
          v-model="activeDatabase"
          size="mini"
          :data="databaseList"
          :filterable="true"
          :allow-search="true"
          :placeholder="$t('dashboard.searchDatabase')"
          @change="onDatabaseChange"
        )
          a-option(v-for="db of databaseList" :key="db" :value="db") {{ db }}
      .gpt-table-sidebar-header__meta
        a-tooltip(v-if="tableCountTooltip" :content="tableCountTooltip")
          span {{ tableCountLabel }}
        span(v-else) {{ tableCountLabel }}
      .gpt-table-sidebar-header__control
        a-input.table-sidebar-search(
          v-model="tablesSearchKey"
          size="mini"
          :allow-clear="true"
          :placeholder="$t('dashboard.input')"
        )
          template(#suffix)
            svg.icon-11.icon-color
              use(href="#search")
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
        a-tooltip(v-if="getNodeIcon(node.node)" :content="node.node.iconType || 'TABLE'")
          svg.icon
            use(:href="getNodeIcon(node.node)")
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
                  svg.icon-11.icon-color
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
        svg.icon-11.icon-color(v-if="!nodeData.isLeaf") 
          use(href="#down")
    EmptyStatus.empty(v-else-if="activeDatabase && !tablesTreeForDatabase[activeDatabase]?.length")
    EmptyStatus.empty(v-else)
</template>

<script lang="ts" setup name="TableManager">
  import { useI18n } from 'vue-i18n'
  import useSiderTabs from '@/hooks/sider-tabs'
  import type { TableTreeParent, TreeData } from '@/store/modules/database/types'
  import type { OptionsType } from '@/types/global'
  import { dateFormatter } from '@/utils'

  const { t } = useI18n()

  const props = defineProps<{
    databaseList: string[]
  }>()

  const appStore = useAppStore()
  const { database } = storeToRefs(appStore)

  const { tablesSearchKey, tablesTreeRef, refreshTables, loadMore, loadMoreColumns, isRefreshingDetails } =
    useSiderTabs()
  const { tablesLoading, totalTablesLoading, tablesTreeForDatabase, tablesTotalByDatabase, databaseActiveKeys } =
    storeToRefs(useDataBaseStore())

  const TABLE_NODE_HEIGHT = 34
  const MIN_VIRTUAL_LIST_HEIGHT = 200

  const activeDatabase = ref<string>(database.value || '')
  const expandedKeys = ref<number[]>([])

  watch(
    () => props.databaseList,
    (newList) => {
      if (newList.length === 0) {
        activeDatabase.value = ''
        databaseActiveKeys.value = []
        return
      }
      if (newList.length > 0 && !activeDatabase.value) {
        const defaultDb = newList.includes(database.value) ? database.value : newList[0]
        activeDatabase.value = defaultDb
        databaseActiveKeys.value = [defaultDb]
        refreshTables(defaultDb)
      }
    },
    { immediate: true }
  )

  const expandedTablesTree = computed(() => {
    return tablesTreeForDatabase.value[activeDatabase.value] || []
  })

  const tablesTreeData = computed(() => {
    if (!tablesSearchKey.value) return expandedTablesTree.value
    return expandedTablesTree.value.filter(
      (item: TableTreeParent) => item.title.toLowerCase().indexOf(tablesSearchKey.value.toLowerCase()) > -1
    )
  })

  const tablesTotalCount = computed(() => {
    const db = activeDatabase.value
    if (!db) return 0
    const total = tablesTotalByDatabase.value[db]
    if (total !== undefined) return total
    return tablesTreeForDatabase.value[db]?.length ?? 0
  })

  const filteredTablesCount = computed(() => tablesTreeData.value.length)

  const isTableSearchActive = computed(() => tablesSearchKey.value.trim().length > 0)

  const tableCountLabel = computed(() => {
    if (isTableSearchActive.value) {
      return `${filteredTablesCount.value}/${tablesTotalCount.value}`
    }
    return t('tables.sidebar.countTotal', { count: tablesTotalCount.value })
  })

  const tableCountTooltip = computed(() => (isTableSearchActive.value ? t('tables.sidebar.countFilteredTooltip') : ''))

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
      await appStore.refreshDatabaseList()
    }
  }

  const onDatabaseChange = async (db: string) => {
    tablesSearchKey.value = ''
    expandedKeys.value = []
    activeDatabase.value = db
    database.value = db
    databaseActiveKeys.value = [db]
    if (!tablesTreeForDatabase.value[db]) {
      await refreshTables(db)
    } else if (tablesTreeRef.value && tablesTreeRef.value[db]) {
      tablesTreeRef.value[db].expandAll(false)
    }
  }

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

  const getNodeIcon = (node: { iconType?: string; isLeaf?: boolean }) => {
    if (node.iconType) return ICON_MAP[node.iconType] || ''
    return node.isLeaf ? '' : '#table'
  }
</script>

<style scoped lang="less">
  .arco-card.table-manager {
    border-radius: 0;
    padding: 0;

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

  .arco-typography {
    display: inline-flex;
    white-space: pre-wrap;
    color: var(--small-font-color);
    background-color: transparent;
    border: 0;
    border-radius: var(--gpt-radius-sm);
  }

  .table-tree {
    flex: 1;
    min-height: 0;
    height: auto;

    :deep(.arco-tree-node-icon .icon:has(use[href='#table'])) {
      color: var(--gpt-accent-ts);
    }

    :deep(.arco-tree-node.arco-tree-node-is-leaf.details) {
      cursor: default;

      .arco-tree-node-title {
        border: none;
      }

      .detail-row {
        font-size: var(--gpt-font-sm);
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
    border-radius: var(--gpt-radius-md);
    border: 1px solid var(--border-color);
    padding: 0 0 4px 10px;
    font-family: var(--font-mono);

    .code-space {
      padding-top: 6px;
      font-size: var(--gpt-font-sm);
    }

    .icon {
      width: 11px;
      height: 11px;
    }
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

    &.code {
      :deep(.arco-btn-text.arco-btn-only-icon) {
        .icon {
          width: 14px;
          height: 14px;
        }
      }
    }
  }

  .empty {
    display: flex;
    align-items: center;
    justify-content: center;
    flex-direction: column;
  }

  .table-sidebar-title {
    width: 100%;
  }

  .table-sidebar-refresh.arco-btn-text.arco-btn-only-icon {
    width: var(--gpt-control-height-sm);
    height: var(--gpt-control-height-sm);
    padding: 0;
    border: none;
    background: transparent;
  }
</style>
