<template lang="pug">
a-card.table-manager(:bordered="false")
  template(#title)
    a-space(:size="10")
      | Tables
      a-button(type="outline" size="small" @click="refreshTables")
        template(#icon)
          svg.icon.brand-color
            use(href="#refresh")
    a-space
      a-input(v-model="tablesSearchKey" :allow-clear="true" :placeholder="$t('dashboard.input')")
        template(#prefix)
          svg.icon.icon-color
            use(href="#search")
  a-spin(style="width: 100%" :loading="tablesLoading")
    a-tree.table-tree(
      v-if="tablesTreeData && tablesTreeData.length > 0"
      ref="tablesTreeRef"
      v-model:expanded-keys="expandedKeys"
      size="small"
      action-on-node-click="expand"
      :block-node="true"
      :data="tablesTreeData"
      :load-more="loadMore"
      :animation="false"
      :virtual-list-props="{ height: `calc(100vh - ${listHeight}px)` }"
    )
      template(#icon="node")
        a-tooltip(v-if="node.node.iconType" :content="node.node.iconType")
          svg.icon-18
            use(:href="ICON_MAP[node.node.iconType]")
      template(#title="nodeData")
        .tree-data(v-if="!nodeData.isLeaf")
          a-tooltip.data-type(mini :content="nodeData.title")
            .data-title
              | {{ nodeData.title }}
          a-space(:size="6")
            a-tooltip(mini :content="$t('dashboard.columns')")
              a-button(type="text" size="small" @click="(event) => expandChildren(event, nodeData, 'columns')")
                template(#icon)
                  svg.icon-18(
                    :class="nodeData.childrenType === 'columns' && expandedKeys?.includes(nodeData.key) ? '' : 'icon-color'"
                  )
                    use(href="#columns")
            a-tooltip(mini :content="$t('dashboard.details')")
              a-button(type="text" size="small" @click="(event) => expandChildren(event, nodeData, 'details')")
                template(#icon)
                  svg.icon-18(
                    :class="nodeData.childrenType === 'details' && expandedKeys?.includes(nodeData.key) ? '' : 'icon-color'"
                  )
                    use(href="#details")
            a-dropdown.quick-select(trigger="click" position="right" @click="(event) => clickMenu(event, nodeData)")
              a-tooltip(mini :content="$t('dashboard.quickSelect')")
                a-button(type="text" size="small")
                  template(#icon)
                    svg.icon-18.icon-color
                      use(href="#query")
              template(#content)
                a-doption(v-for="item of SHORTCUT_MAP['TABLE']" v-show="route.name === 'query'")
                  a-spin(style="width: 100%" :loading="nodeData.children && !nodeData.children.length")
                    ShortCut(
                      :type="item.value"
                      :node="nodeData"
                      :parent="nodeData.iconType ? originTablesTree[nodeData.parentKey] : nodeData"
                      :label="item.label"
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
                    svg.icon-18.icon-color
                      use(href="#query")
              template(#content)
                a-doption(v-for="item of SHORTCUT_MAP[nodeData.iconType || 'TABLE']" v-show="route.name === 'query'")
                  a-spin(style="width: 100%" :loading="nodeData.children && !nodeData.children.length")
                    ShortCut(
                      :type="item.value"
                      :node="nodeData"
                      :parent="nodeData.iconType ? originTablesTree[nodeData.parentKey] : nodeData"
                      :label="item.label"
                    )
            TextCopyable.title-copy.columns(
              type="text"
              :data="nodeData.title"
              :show-data="false"
              @click.stop
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
                @click="loadMore(originTablesTree[nodeData.parentKey])"
              )
                template(#icon)
                  svg.icon-16.icon-color
                    use(href="#refresh")
            a-space(:size="4")
              span {{ $t('dashboard.minTime') }}
              a-tooltip(v-if="nodeData.info.min !== '-'" :content="`${nodeData.info.min}`")
                span {{ dateFormatter(nodeData.info.timestampType, nodeData.info.min) }}
              span(v-else) {{ nodeData.info.min }}
            a-space(:size="4")
              span {{ $t('dashboard.maxTime') }}
              a-tooltip(v-if="nodeData.info.max !== '-'" :content="`${nodeData.info.max}`")
                span {{ dateFormatter(nodeData.info.timestampType, nodeData.info.max) }}
              span(v-else) {{ nodeData.info.max }}
            a-button.refresh-details.row-end(
              type="text"
              size="small"
              :loading="isRefreshingDetails[nodeData.parentKey]"
              @click="loadMore(originTablesTree[nodeData.parentKey])"
            )
              template(#icon)
                svg.icon-16.icon-color
                  use(href="#refresh")
          a-space(v-else)
            a-space(align="start" :class="{ 'create-table': nodeData.info.sql !== '-' }" :size="4")
              .left {{ $t('dashboard.createTable') }}
              span.empty-sql(v-if="nodeData.info.sql === '-'") {{ nodeData.info.sql }}
              .right(v-else)
                a-typography-text.code-space {{ nodeData.info.sql }}
                TextCopyable(
                  :data="nodeData.info.sql"
                  :showData="false"
                  :copyTooltip="$t('dashboard.copyToClipboard')"
                )
      template(#switcher-icon="nodeData")
        svg.icon-18(v-if="!nodeData.isLeaf")
          use(href="#tables")
    EmptyStatus.empty(v-else)
</template>

<script lang="ts" setup name="TableManager">
  import usePythonCode from '@/hooks/python-code'
  import useSiderTabs from '@/hooks/sider-tabs'
  import type { TableTreeParent, TreeData } from '@/store/modules/database/types'
  import type { OptionsType } from '@/types/global'
  import { dateFormatter } from '@/utils'

  const route = useRoute()
  const { insertNameToPyCode } = usePythonCode()
  const {
    tablesSearchKey,
    tablesTreeData,
    tablesTreeRef,
    isRefreshingDetails,
    refreshTables,
    loadMore,
    loadMoreColumns,
  } = useSiderTabs()
  const { tablesLoading, originTablesTree } = storeToRefs(useDataBaseStore())

  const LAYOUT_PADDING = 16
  const HEADER = 58
  const listHeight = LAYOUT_PADDING * 3 + HEADER

  const expandedKeys = ref<number[]>()

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

  const INSERT_MAP: { [key: string]: any } = {
    // query: insertNameToQueryCode,
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
    event.stopPropagation()
    if (!nodeData.columns.length) {
      loadMoreColumns(nodeData)
    }
  }
</script>

<style scoped lang="less">
  .arco-card.table-manager {
    background: var(--card-bg-color);
    border-radius: 10px;
    padding: 0;
    height: 100%;
    :deep(> .arco-card-header) {
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
    padding-right: 4px;
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

  .table-tree {
    padding-left: 12px;
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
      padding: 0 0 0 8px;
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
      border-top: 1px solid var(--border-color);
      border-radius: 0;

      .arco-tree-node-title {
        padding: 7px 0;
      }
    }
    :deep(.arco-tree-node.arco-tree-node-is-leaf) {
      .arco-tree-node-title {
        padding: 0;
        border-radius: 0;
        margin-left: 9px;
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
        font-size: 12px;
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
    font-size: 16px;
    line-height: 30px;
    &.columns {
      color: var(--small-font-color);
      font-size: 14px;
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
    }
  }

  :deep(.arco-tree-node-switcher) {
    width: 18px;
  }
  .arco-tree-node-switcher-icon {
    width: 18px;
    svg {
      transform: rotate(0);
    }
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
      width: 18px;
      height: 18px;
    }

    :deep(.arco-btn-size-medium.arco-btn-only-icon) {
      width: 28px;
      height: 28px;
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
</style>
