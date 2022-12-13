<template lang="pug">
a-layout
  .layout-navbar(v-if="navbar")
    NavBar
  .container
    a-space(direction="vertical" fill :size="15")
      a-split.tree-split(default-size="260px" min="200px")
        template(#first)
          a-card.tree-card
            template(#title)
              img.tree-icon(src="/src/assets/images/tree-icon.svg")
              span.tree-title {{$t('dataExplorer.tableTree')}}
            template(#extra)
              img.tree-refresh(src="/src/assets/images/tree-refresh.svg" height="16" style="cursor: pointer" @click="refreshTableData" fit="fill")
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
  .layout-navbar {
    height: 52px;
  }

  .container {
    padding: 20px 30px 30px 30px;
    display: flex;
    width: 100%;
    flex: 1;
    flex-direction: column;
  }
  .tree-split {
    height: 296px;
  }
  .tree-card {
    border-radius: 6px;
    background: #ffffff;
    padding-right: 8px;
    padding-left: 15px;
    :deep(.arco-card-header) {
      border-bottom: 0;
      padding: 0;
      height: 42px;
      line-height: 42px;
    }
    :deep(.arco-card-header-title) {
      font-size: 14px;
      display: flex;
      align-items: center;
    }
    :deep(.arco-card-body) {
      padding: 0;
    }
  }
  .tree-refresh {
    display: table-cell;
    vertical-align: middle;
    text-align: center;
    height: 16px;
  }
  .tree-icon {
    margin-right: 2px;
    height: 14px;
    vertical-align: middle;
  }
  .tree-title {
    font-family: Roboto-Regular, Roboto;
    font-weight: 400;
    color: #170c2c;
    line-height: 12px;
  }
  .left-side {
    flex: 1;
    overflow: auto;
  }

  .right-side {
    width: 280px;
    margin-left: 16px;
  }

  .panel {
    background-color: var(--color-bg-2);
    border-radius: 4px;
    overflow: auto;
  }

  :deep(.panel-border) {
    margin-bottom: 0;
    border-bottom: 1px solid rgb(var(--gray-2));
  }

  .moduler-wrap {
    border-radius: 4px;
    background-color: var(--color-bg-2);

    :deep(.text) {
      font-size: 12px;
      text-align: center;
      color: rgb(var(--gray-8));
    }

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

    :deep(.icon) {
      display: inline-block;
      width: 32px;
      height: 32px;
      margin-bottom: 4px;
      color: rgb(var(--dark-gray-1));
      line-height: 32px;
      font-size: 16px;
      text-align: center;
      background-color: rgb(var(--gray-1));
      border-radius: 4px;
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
