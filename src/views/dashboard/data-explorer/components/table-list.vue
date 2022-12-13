<template lang="pug">
a-tree(v-if="!ifTableLoading" :key="tableKey" :data="tableList" :load-more="loadMore" size="small")
  template(#extra="nodeData")
    span.data-type
      | {{ nodeData.type }}
    a-tooltip(:content="$t('dataExplorer.insertName')" mini)
      img.copy-icon(src="/src/assets/images/copy-icon.png" height="16" @click="insertNameToCode(nodeData.title)")
  template(#icon="nodeData")
    a-image(src="/src/assets/images/value-icon.png" v-if="nodeData.isLeaf" height="12" fit="contain")
</template>

<script lang="ts" setup>
  import { storeToRefs } from 'pinia'
  import { useDataBaseStore } from '@/store'
  import useDataExplorer from '@/hooks/data-explorer'
  import { dateTypes } from '@/views/dashboard/data-explorer/components/data-view/config'

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
              type: row[1],
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
  :deep(.arco-tree-node) {
    height: 32px;
    line-height: 32px;
    padding: 0;
    cursor: auto;
  }
  // :deep(.arco-tree-node-selected) {
  //   background-color: #8322ff;
  //   opacity: 0.05;
  // }
  :deep(.arco-tree-node-switcher) {
    margin-right: 5px;
    width: 12px;
    font-size: 15px;
  }

  :deep(.arco-tree-node-is-leaf) {
    .arco-tree-node-indent-block {
      margin-right: 0;
    }
    .arco-tree-node-switcher {
      width: 0;
    }
  }
  :deep(.arco-tree-node-title) {
    margin-left: 0;
    font-size: 12px;
    font-family: PingFangSC-Regular, PingFang SC;
    font-weight: 400;
    color: #53565a;
    line-height: 32px;
    height: 32px;
    padding: 0;
  }
  :deep(.arco-tree-node-title-text) {
    line-height: 32px;
    height: 32px;
  }
  :deep(.arco-tree-node-custom-icon) {
    margin-right: 4px;
  }
  :deep(.arco-tree-node-switcher:hover) {
    background-color: inherit;
  }
  .copy-icon {
    position: absolute;
    right: 0;
    cursor: pointer;
  }
</style>
