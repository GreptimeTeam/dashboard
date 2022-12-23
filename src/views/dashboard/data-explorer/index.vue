<template lang="pug">
.layout-container
  .layout-navbar(v-if="navbar")
      NavBar
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
    DataView(v-if="!!results.length")
    Log 
</template>

<script lang="ts" name="DataExplorer" setup>
  import NavBar from '@/components/navbar/index.vue'

  const appStore = useAppStore()
  const navbar = computed(() => appStore.navbar)
  const { fetchDataBaseTables: refreshTableData } = useDataBaseStore()
  const { results } = storeToRefs(useCodeRunStore())
</script>

<style lang="less" scoped>
  .layout-container {
    display: flex;
    width: 100%;
    flex: 1;
    flex-direction: column;
  }
  .layout-navbar {
    height: 52px;
  }
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
