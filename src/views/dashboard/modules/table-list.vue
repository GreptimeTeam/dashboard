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
  .tree-scrollbar(v-if="tablesTreeData && tablesTreeData.length > 0" ref="treeScrollRef")
    a-tree.table-tree(
      ref="treeRef"
      size="small"
      :block-node="true"
      :data="tablesTreeData"
      :load-more="loadMore"
      :animation="false"
      :virtual-list-props="{ height: 'calc(100vh - 220px)' }"
      :class="hasScroll ? 'has-scroll' : 'has-no-scroll'"
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
  .tree-scrollbar(v-else)
    a-empty
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
  import type { TreeData } from '@/store/modules/database/types'

  const route = useRoute()
  const { insertNameToQueryCode } = useQueryCode()
  const { insertNameToPyCode } = usePythonCode()
  const { tablesSearchKey, tablesTreeData } = useSiderTabs()
  const { tablesLoading } = storeToRefs(useDataBaseStore())
  const { getTableByName, getTables, addChildren } = useDataBaseStore()

  const treeRef = ref()
  const hasScroll = ref(false)
  const treeScrollRef = ref<HTMLDivElement>()

  const refreshTables = () => {
    tablesSearchKey.value = ''
    getTables()
    if (treeRef.value) treeRef.value.expandAll(false)
  }

  watchEffect(() => {
    if ((treeScrollRef.value as HTMLDivElement) && tablesTreeData.value) {
      const child = (treeScrollRef.value as HTMLDivElement).firstElementChild?.firstElementChild

      nextTick(() => {
        const { clientWidth, offsetWidth } = child as HTMLDivElement
        hasScroll.value = clientWidth !== offsetWidth
      })
    }
  })

  const loadMore = (nodeData: any) => {
    return new Promise<void>((resolve, reject) => {
      getTableByName(nodeData.title)
        .then((result: any) => {
          const { output } = result
          const {
            records: { rows },
          } = output[0]
          const rowArray: TreeData[] = []
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
