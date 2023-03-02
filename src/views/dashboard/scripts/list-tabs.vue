<template lang="pug">
a-tabs.sider-tabs(v-model:active-key="tabActiveKey" default-active-key="2"
  lazy-load type="rounded" :class="codeType === 'sql' ? 'one-tab' : ''")
  a-tab-pane(key="1" title="Tables")
    a-card(:bordered="false").tree-card
      TableList    
  a-tab-pane(key="2" title="scripts")
    a-card(:bordered="false").tree-card
      ScriptsList
</template>

<script lang="ts" name="ListTabs" setup>
  import usePythonCode from '@/hooks/python-code'
  import tableList from '../modules/table-list.vue'
  import ScriptsList from './scripts-list.vue'

  const { getTables: refreshTableData } = useDataBaseStore()

  const { codeType } = storeToRefs(useAppStore())

  const tabActiveKey = ref()
  if (codeType.value === 'sql') {
    tabActiveKey.value = '1'
  }
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
