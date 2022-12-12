<template lang="pug">
a-tree(v-if="!ifTableLoading" :key="tableKey" :data="tableList" :load-more="loadMore" size="large")
  template(#extra="nodeData")
    span(style="color: #8322ff")
      | {{ nodeData.type }}
    a-tooltip(:content="$t('dataExplorer.insertName')" mini)
      img.copy-icon(src="/src/assets/images/copy-icon.png" height="16" @click="insertNameToCode(nodeData.title)")
  template(#icon="nodeData")
    IconStar(v-if="nodeData.isLeaf")
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
  :deep(.arco-tree-node) {
    height: 32px;
    font-size: 12px;
    font-family: PingFangSC-Regular, PingFang SC;
    font-weight: 400;
    color: #53565a;
    line-height: 12px;
  }
  .copy-icon {
    position: absolute;
    right: 0;
  }
</style>
