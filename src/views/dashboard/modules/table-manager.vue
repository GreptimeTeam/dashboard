<template lang="pug">
a-card.table-manager(:bordered="false")
  template(#title)
    a-space
      | Tables
      .icon-space.pointer(@click="refreshTables")
        svg.icon.brand-color
          use(href="#refresh")
    a-space
      a-input(v-model="tablesSearchKey" :allow-clear="true")
        template(#prefix)
          svg.icon
            use(href="#search")
  a-spin(style="width: 100%" :loading="tablesLoading")
    //- a-list(:data="tablesTreeData" :virtual-list-props="{ height: `calc(100vh - ${listHeight}px)` }")
    //-   template(#item="{ item, index }")
    //-     a-list-item(:key="index")
    //-       |

    //- a-table(:data="tablesTreeData" :load-more="tableLoadMore")
    //-   template(#columns)
    //-     a-table-column(title="title" data-index="title")
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
      :virtual-list-props="{ height: `calc(100vh - ${listHeight}px)` }"
    )
      template.test(#icon="node")
        a-tooltip(v-if="node.node.iconType" :content="node.node.iconType")
          svg.icon-16
            use(:href="ICON_MAP[node.node.iconType]")
      template(#title="nodeData")
        .tree-data(v-if="!nodeData.isLeaf")
          a-tooltip.data-type(mini :content="nodeData.title")
            .data-title
              | {{ nodeData.title }}
          .tree-data
            a-button(type="text" @click="(event) => expandChildren(event, nodeData, 'columns')")
              template(#icon)
                svg.icon-18(
                  :class="nodeData.childrenType === 'columns' && expandedKeys?.includes(nodeData.key) ? '' : 'icon-color'"
                )
                  use(href="#columns")
            a-button(type="text" @click="(event) => expandChildren(event, nodeData, 'details')")
              template(#icon)
                svg.icon-18(
                  :class="nodeData.childrenType === 'details' && expandedKeys?.includes(nodeData.key) ? '' : 'icon-color'"
                )
                  use(href="#details")
            ShortCut(
              :type="'select*100'"
              :node="nodeData"
              :parent="nodeData"
              :label="''"
              @click.stop
            )
            TextCopyable.copy.query-copy(
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
            a-dropdown.menu-dropdown(
              v-if="nodeData.dataType"
              trigger="click"
              position="right"
              @click="(event) => clickMenu(event, nodeData)"
            )
              a-button(type="text")
                template(#icon)
                  svg.icon-18
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
            TextCopyable.copy(
              type="text"
              :data="nodeData.title"
              :show-data="false"
              @click.stop
            )
        .data-title(v-else)
          a-space(v-if="nodeData.title === 'rowAndTime'" fill style="justify-content: space-between")
            div {{ $t('dashboard.rowCount') }} {{ nodeData.info.rowCount }}
            div {{ $t('dashboard.minTime') }} {{ nodeData.info.min }}
            div {{ $t('dashboard.maxTime') }} {{ nodeData.info.max }}
            div {{ `TTL` }} {{ nodeData.info.ttl }}
            a-button(type="text" @click="loadMore(tablesTreeData[nodeData.parentKey], true)")
              template(#icon)
                svg.icon-18
                  use(href="#refresh")
          a-space.create-table(v-else align="start")
            .left {{ $t('dashboard.createTable') }}
            .right
              TextCopyable(
                :data="codeFormatter(nodeData.info.sql)"
                :showData="false"
                :copyTooltip="$t('dashboard.copyToClipboard')"
              )
              a-typography-text(code style="white-space: pre-wrap") {{ codeFormatter(nodeData.info.sql) }}
      template(#switcher-icon="nodeData")
        svg.icon-18(v-if="!nodeData.isLeaf")
          use(href="#tables")
    .tree-scrollbar(v-else)
      EmptyStatus
</template>

<script lang="ts" setup name="TableManager">
  import { storeToRefs } from 'pinia'
  import { useDataBaseStore } from '@/store'
  import useQueryCode from '@/hooks/query-code'
  import usePythonCode from '@/hooks/python-code'
  import useSiderTabs from '@/hooks/sider-tabs'
  import type { TableTreeChild, TableTreeParent, TreeData } from '@/store/modules/database/types'
  import type { OptionsType } from '@/types/global'
  import { useClipboard } from '@vueuse/core'
  import editorAPI from '@/api/editor'
  import { format } from 'sql-formatter'

  const source = ref('')
  const { text, copy, copied, isSupported } = useClipboard({ source })
  const route = useRoute()
  const { insertNameToQueryCode } = useQueryCode()
  const { insertNameToPyCode } = usePythonCode()
  const { tablesSearchKey, tablesTreeData } = useSiderTabs()
  const { tablesLoading, originTablesTree } = storeToRefs(useDataBaseStore())
  const { getTableByName, getTables, addChildren, generateTreeChildren } = useDataBaseStore()

  const LAYOUT_PADDING = 16
  const HEADER = 58

  const listHeight = LAYOUT_PADDING * 3 + HEADER

  const treeRef = ref()
  const expandedKeys = ref<number[]>()

  watchEffect(() => {
    console.log(expandedKeys.value)
  })

  const expandChildren = (event: Event, nodeData: TableTreeParent, type: 'details' | 'columns') => {
    console.log(nodeData.key)
    console.log(type)
    if (nodeData[type].length && type !== nodeData.childrenType && expandedKeys.value?.includes(nodeData.key)) {
      event.stopPropagation()
    }

    nodeData.children = nodeData[type]
    console.log(nodeData.children)
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

  // watchEffect(() => {
  //   if (tablesSearchKey.value.trim().length) {
  //     if (treeRef.value) treeRef.value.expandAll(false)
  //   }
  // })

  const refreshTables = () => {
    tablesSearchKey.value = ''
    getTables()
    if (treeRef.value) treeRef.value.expandAll(false)
  }

  const loadMoreColumns = (nodeData: TableTreeParent) =>
    new Promise<void>((resolve, reject) => {
      getTableByName(nodeData.title)
        .then((result: any) => {
          const { output } = result
          const {
            records: {
              rows,
              schema: { column_schemas: columnSchemas },
            },
          } = output[0]
          const { treeChildren, timeIndexName } = generateTreeChildren(nodeData, rows, columnSchemas)
          addChildren(nodeData.key, treeChildren, timeIndexName)
          resolve()
        })
        .catch(() => {
          reject()
        })
    })

  const loadMore = async (nodeData: TableTreeParent) => {
    if (nodeData.childrenType === 'details') {
      const createTable = new Promise<object>((resolve, reject) => {
        editorAPI
          .runSQL(`show create table ${nodeData.title}`)
          .then((res: any) => {
            const sql = `${res.output[0].records.rows[0][1]}`
            console.log(sql.search('ttl = '))
            const result = {
              key: 'createTable',
              value: { sql, ttl: 'test' },
            }
            resolve(result)
          })
          .catch(() => {
            const result = {
              key: 'createTable',
              value: { sql: '', ttl: '' },
            }
            reject(result)
          })
      })

      const rowAndTime = new Promise<object>((resolve, reject) => {
        const getRowAndTime = () => {
          editorAPI
            .runSQL(
              `select count(*), min (${nodeData.timeIndexName}), max (${nodeData.timeIndexName}) from ${nodeData.title}`
            )
            .then((res: any) => {
              const resArray = res.output[0].records.rows[0]
              const result = {
                key: 'rowAndTime',
                value: { rowCount: resArray[0], min: resArray[1], max: resArray[2] },
              }
              resolve(result)
            })
            .catch(() => {
              const result = {
                key: 'rowAndTime',
                value: { rowCount: 0, min: 0, max: 0 },
              }
              reject(result)
            })
        }
        if (!nodeData.timeIndexName) {
          loadMoreColumns(nodeData).then(() => getRowAndTime())
        } else {
          getRowAndTime()
        }
      })

      return Promise.allSettled([rowAndTime, createTable]).then((result: any[]) => {
        const info: { [key: string]: any } = {}
        const children2: any[] = []
        const rowAndTimeResult = result[0].value || result[0].reason
        const createTableResult = result[1].value || result[1].reason
        children2.push({
          key: `${nodeData.title}.details.${rowAndTimeResult.key}`,
          title: rowAndTimeResult.key,
          parentKey: nodeData.key,
          tableName: nodeData.title,
          isLeaf: true,
          info: { ...rowAndTimeResult.value, ttl: createTableResult.value.ttl },
          class: 'details',
        })

        children2.push({
          key: `${nodeData.title}.details.${createTableResult.key}`,
          title: createTableResult.key,
          parentKey: nodeData.key,
          tableName: nodeData.title,
          isLeaf: true,
          info: createTableResult.value,
          class: 'details',
        })
        // result
        //   .map((item: any) => item.value)
        //   .forEach((item: any) => {
        //     children2.push({
        //       key: `${nodeData.title}.details.${item.key}`,
        //       title: item.key,
        //       parentKey: nodeData.key,
        //       isLeaf: true,
        //       // error?
        //       info: item.value,
        //     })
        //   })

        addChildren(nodeData.key, children2, nodeData.timeIndexName, 'details')
      })
    }
    return loadMoreColumns(nodeData)
  }

  const INSERT_MAP: { [key: string]: any } = {
    query: insertNameToQueryCode,
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

  const codeFormatter = (code: string) => {
    return format(code, { language: 'mysql', keywordCase: 'upper' })
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

  .arco-typography {
    display: inline-flex;
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
      padding-left: 20px;
      line-height: 30px;
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
    :deep(.arco-tree-node.arco-tree-node-is-leaf:not(.details)) {
      padding: 0;
      padding-left: 20px;
      .arco-tree-node-indent {
        width: 9px;
      }
      .arco-tree-node-title {
        padding: 0 0 0 12px;
        border-left: 1px solid var(--border-color);
        border-radius: 0;
      }
    }
    :deep(.arco-tree-node.arco-tree-node-is-leaf:hover) {
      background: var(--tree-select-brand-color);
    }

    :deep(.arco-tree-node.arco-tree-node-is-leaf.details) {
      padding: 0;

      .arco-tree-node-title {
        padding: 7px 0 7px 12px;
        border-radius: 0;
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
    padding-left: 4px;
    font-size: 16px;
    line-height: 30px;
    &.columns {
      color: var(--small-font-color);
      font-size: 14px;
    }
  }
  .create-table {
    .left {
      width: 120px;
    }
    .right {
      overflow: hidden;
    }
  }

  .query-copy {
    :deep(.arco-typography-operation-copy) {
      .icon {
        width: 17px;
        height: 17px;
      }
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
    margin-left: 0px;
  }
</style>

<style lang="less"></style>
