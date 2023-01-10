<template lang="pug">
a-space.layout-content(direction="vertical" fill :size="14")
  a-split.tree-split(default-size="260px" min="200px")
    template(#first)
      a-card(:bordered="false").tree-card
        template(#title)
          svg.card-icon
            use(href="#tree")
          span {{$t('dataExplorer.tableTree')}}
        template(#extra)
          svg.icon.pointer(@click="refreshTableData")
            use(href="#refresh")
        TableList     
    template(#second) 
      Editor 
  DataView(v-if="!!results.sql.length")
  Log 
</template>

<script lang="ts" name="DataExplorer" setup>
  import router from '@/router'

  const { fetchDataBaseTables: refreshTableData } = useDataBaseStore()
  const { results } = storeToRefs(useCodeRunStore())
  const { codeType } = storeToRefs(useAppStore())

  const { name } = router.currentRoute.value
  // TODO: add more code type in the future if needed
  codeType.value = name === 'sql' ? 'sql' : 'python'
</script>

<style lang="less" scoped>
  .layout-content {
    padding: 20px 30px 30px 30px;
  }
  .tree-split {
    height: 296px;
  }
  .left-side {
    flex: 1;
    overflow: auto;
  }

  .right-side {
    width: 280px;
    margin-left: 16px;
  }
</style>

<style lang="less" scoped>
  // responsive
  .mobile {
    .container {
      display: block;
    }

    .right-side {
      // display: none;
      width: 100%;
      margin-left: 0;
      margin-top: 16px;
    }
  }
</style>
