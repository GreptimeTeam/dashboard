<template lang="pug">
a-scrollbar.tree-scrollbar
  a-tree.table-tree(v-if="!ifTableLoading" :key="tableKey" :data="tableList" :load-more="loadMore" size="small")
    template(#title)
    template(#extra="nodeData")
      img(:src="ICON_MAP[nodeData.iconType]" height="12")
      span.tree-title
        | {{ nodeData.title }}
      span.data-type
        | {{ nodeData.dataType }}
      a-tooltip(:content="$t('dataExplorer.insertName')" mini)
        svg.icon.copy-icon.pointer(name="copy" @click="insertNameToCode(nodeData.title)")
          use(href="#copy")
</template>

<script lang="ts" setup>
  import { storeToRefs } from 'pinia'
  import { useDataBaseStore } from '@/store'
  import useDataExplorer from '@/hooks/data-explorer'

  const dataBaseStore = useDataBaseStore()
  const dataExplorer = useDataExplorer()

  const { insertNameToCode } = dataExplorer

  const initTableDataSet = () => {
    dataBaseStore.fetchDataBaseTables()
  }
  const { fetchOneTable } = dataBaseStore
  const { tableList, ifTableLoading, tableKey } = storeToRefs(dataBaseStore)
  const loadMore = (nodeData: any) => {
    return new Promise<void>((resolve, reject) => {
      fetchOneTable(nodeData.title)
        .then((result: any) => {
          const { output } = result
          const {
            records: { rows },
          } = output[0]
          const rowArray: any = []
          rows.forEach((row: any) => {
            rowArray.push({
              title: row[0],
              key: row[0],
              isLeaf: true,
              dataType: row[1],
              iconType: row[4],
            })
          })
          // todo: change computed data might not be the best option.
          nodeData.children = rowArray
          resolve()
          // todo: change key to update component might not be the best option.
          tableKey.value += 1
        })
        .catch(() => {
          reject()
        })
    })
  }

  const ICON_MAP = {
    'VALUE': '/src/assets/images/value-icon.png',
    'PRIMARY KEY': '/src/assets/images/key-icon.png',
    'TIME INDEX': '/src/assets/images/time-icon.png',
  }
  initTableDataSet()
</script>
<style lang="less" scoped>
  .data-type {
    height: 32px;
    font-size: 12px;
    font-family: PingFangSC-Regular, PingFang SC;
    font-weight: 400;
    color: var(--brand-color);
    line-height: 32px;
    padding-left: 2px;
  }
  .tree-title {
    height: 32px;
    font-size: 12px;
    font-family: PingFangSC-Regular, PingFang SC;
    font-weight: 400;
    color: var(--main-font-color);
    line-height: 32px;
    padding-left: 2px;
  }
  // :deep(.arco-tree-node-selected) {
  //   background-color: #8322ff;
  //   opacity: 0.05;
  // }

  .copy-icon {
    position: absolute;
    right: 0;
  }
</style>
