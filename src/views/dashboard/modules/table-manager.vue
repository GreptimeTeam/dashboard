<template lang="pug">
a-card.table-manager
  template(#title)
    | Tables
    a-space
      a-input(v-model="tablesSearchKey" :allow-clear="true")
        template(#prefix)
          svg.icon
            use(href="#search")
      .icon-space.pointer(@click="refreshTables")
        svg.icon
          use(href="#refresh")
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
        a-tooltip(:content="node.node.iconType")
          svg.icon-16(v-if="node.node.iconType")
            use(:href="ICON_MAP[node.node.iconType]")
      template(#title="nodeData")
        .tree-data(v-if="!nodeData.isLeaf")
          a-tooltip.data-type(mini :content="nodeData.title")
            .data-title
              | {{ nodeData.title }}
          .tree-data
            a-button(
              :type="nodeData.childrenType === 'details' && expandedKeys?.includes(nodeData.key) ? 'primary' : 'secondary'"
              @click="(event) => expandChildren(event, nodeData, 'details')"
            ) details
            a-button(
              :type="nodeData.childrenType === 'columns' && expandedKeys?.includes(nodeData.key) ? 'primary' : 'secondary'"
              @click="(event) => expandChildren(event, nodeData, 'columns')"
            ) columns
            a-button(@click.stop)
              ShortCut(
                :type="'select*100'"
                :node="nodeData"
                :parent="nodeData"
                :label="'Query'"
              )
            TextCopyable.copy(
              type="text"
              :data="nodeData.title"
              :show-data="false"
              @click.stop
            )
        .tree-data(v-else-if="nodeData.dataType")
          .data-title
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
            TextCopyable.copy(
              type="text"
              :data="nodeData.title"
              :show-data="false"
              @click.stop
            )
        .data-title(v-else)
          a-space(v-if="nodeData.title === 'timeScale'" fill style="justify-content: space-between")
            div {{ $t('dashboard.minTime') }} {{ nodeData.info.min }}
            div {{ $t('dashboard.maxTime') }} {{ nodeData.info.max }}
          a-space(v-else-if="nodeData.title === 'rowCount'" fill style="justify-content: space-between")
            div {{ $t('dashboard.rowCount') }} {{ nodeData.info }}
            div TTL
          a-space.create-table(v-else)
            .left {{ $t('dashboard.createTable') }}
            a-popover
              .right
                TextCopyable(
                  :data="codeFormatter(nodeData.info.sql)"
                  :showData="false"
                  :copyTooltip="$t('dashboard.copyToClipboard')"
                )
                | {{ nodeData.info }}
              template(#content)
                a-typography-text(code style="white-space: pre-wrap") {{ codeFormatter(nodeData.info.sql) }}
      template(#switcher-icon="nodeData")
        IconDown(v-if="!nodeData.isLeaf")
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
      if (!nodeData.timeIndexName) {
        // error?
        await loadMoreColumns(nodeData)
      }

      const rowCount = new Promise<object>((resolve, reject) => {
        editorAPI
          .runSQL(`select count(*) from ${nodeData.title}`)
          .then((res: any) => {
            const result = {
              key: 'rowCount',
              value: res.output[0].records.rows[0][0],
            }
            resolve(result)
          })
          .catch(() => {
            reject()
          })
      })

      const createTable = new Promise<object>((resolve, reject) => {
        editorAPI
          .runSQL(`show create table ${nodeData.title}`)
          .then((res: any) => {
            const result = {
              key: 'createTable',
              value: { sql: res.output[0].records.rows[0][1], ttl: 'test' },
            }
            resolve(result)
          })
          .catch(() => {
            reject()
          })
      })

      const timeScale = new Promise<object>((resolve, reject) => {
        editorAPI
          .runSQL(
            `select min (${nodeData.timeIndexName}) from ${nodeData.title}; select max (${nodeData.timeIndexName}) from ${nodeData.title}`
          )
          .then((res: any) => {
            const result = {
              key: 'timeScale',
              value: { min: res.output[0].records.rows[0][0], max: res.output[1].records.rows[0][0] },
            }
            resolve(result)
          })
          .catch(() => {
            reject()
          })
      })

      return Promise.allSettled([rowCount, createTable, timeScale]).then((result: any[]) => {
        const info: { [key: string]: any } = {}
        const children2: any[] = []

        result
          .filter((item: any) => item.status === 'fulfilled')
          .map((item: any) => item.value)
          .forEach((item: any) => {
            info[item.key] = item.value
            children2.push({
              key: `${nodeData.title}.details.${item.key}`,
              title: item.key,
              parentKey: nodeData.key,
              isLeaf: true,
              info: item.value,
            })
          })

        const children1: any[] = [
          {
            key: `${nodeData.title}.details.key`,
            title: 'title',
            parentKey: nodeData.key,
            isLeaf: true,
            info,
          },
        ]
        // actually we don't need timeIndexName
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
    padding: 0 12px;
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
      border-top: 1px solid var(--border-color);
      border-radius: 0;
      .arco-tree-node-title {
        padding: 7px 0;
      }
    }
    :deep(.arco-tree-node.arco-tree-node-is-leaf) {
      border: none;
      .arco-tree-node-title {
        padding: 0;
      }
    }
    :deep(.arco-tree-node.arco-tree-node-is-leaf.arco-tree-node-is-tail) {
      border-radius: 0;

      .arco-tree-node-title {
        padding-bottom: 7px;
      }
    }
  }
  .data-title {
    height: 36px;
  }
  .create-table {
    height: 36px;
    .left {
      width: 120px;
    }
    .right {
      overflow: hidden;
      height: 36px;
    }
  }
</style>

<style lang="less"></style>
