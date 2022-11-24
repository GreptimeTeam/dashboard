<template>
  <div class="container">
    <div class="left-side">
      <a-card>
        <a-layout style="height: 390px">
          <a-layout-sider :width="200" :collapsed="collapsed" :collapsed-width="40">
            <a-row :wrap="false" style="height: 40px; line-height: 40px; font-size: large">
              <a-col :span="collapsed ? 0 : 18">
                <div style="margin-left: 20px"
                  >Tables

                  <icon-sync style="font-size: 20px; cursor: pointer" @click="refreshTableData()" /></div
              ></a-col>
              <a-col :span="6">
                <a-button shape="round" @click="onTableSiderCollapse">
                  <icon-caret-left v-if="collapsed" />
                  <icon-caret-right v-else /> </a-button
              ></a-col>
            </a-row>
            <TableList v-show="!collapsed" />
          </a-layout-sider>
          <a-layout-content style="margin-left: 24px">
            <a-row :gutter="24">
              <a-col :flex="8">
                <Editor />
              </a-col>
              <a-col flex="auto">
                <Favorite />
              </a-col>
            </a-row>
          </a-layout-content>
        </a-layout>
        <DataView />
        <Log />
      </a-card>
    </div>
    <div class="right-side"> </div>
  </div>
</template>

<script lang="ts" setup>
  import { ref } from 'vue'
  import { useDataBaseStore } from '@/store'
  import Editor from './components/editor.vue'
  import TableList from './components/table-list.vue'
  import Favorite from './components/favorite.vue'
  import DataView from './components/data-view/data-view-index.vue'
  import Log from './components/log.vue'

  const collapsed = ref(false)
  const onTableSiderCollapse = () => {
    collapsed.value = !collapsed.value
  }
  const dataBaseStore = useDataBaseStore()

  const refreshTableData = dataBaseStore.fetchDataBaseTables
</script>

<script lang="ts">
  export default {
    name: 'DataExplorer', // If you want the include property of keep-alive to take effect, you must name the component
  }
</script>

<style lang="less" scoped>
  .container {
    background-color: var(--color-fill-2);
    padding: 0 20px;
    padding-bottom: 0;
    display: flex;
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
