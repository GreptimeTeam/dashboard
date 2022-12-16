<template lang="pug">
.layout-container
  .layout-navbar(v-if="navbar")
      NavBar
  a-space.layout-content(direction="vertical" fill :size="14")
    a-split.tree-split(default-size="260px" min="200px")
      template(#first)
        a-card.tree-card
          template(#title)
            svg.card-icon
              use(href="#tree")
            span {{$t('dataExplorer.tableTree')}}
          template(#extra)
            svg.icon
              use(href="#refresh")
          TableList     
      template(#second) 
        Editor 
    DataView
    Log 
</template>

<script lang="ts" name="DataExplorer" setup>
  import NavBar from '@/components/navbar/index.vue'

  const appStore = useAppStore()
  const navbar = computed(() => appStore.navbar)
  const { fetchDataBaseTables: refreshTableData } = useDataBaseStore()
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
  .moduler-wrap {
    :deep(.wrapper) {
      margin-bottom: 8px;
      text-align: center;
      cursor: pointer;

      &:last-child {
        .text {
          margin-bottom: 0;
        }
      }

      &:hover {
        .icon {
          color: rgb(var(--arcoblue-6));
          background-color: #e8f3ff;
        }

        .text {
          color: rgb(var(--arcoblue-6));
        }
      }
    }
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
