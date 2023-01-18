<template lang="pug">
a-tabs(position="left" lazy-load default-active-key="2")
  a-tab-pane(key="1")
    template(#title)
      svg.icon 
        use(href="#tree")
    a-card(:bordered="false").tree-card
      template(#title)
        svg.card-icon
          use(href="#tree")
        span {{$t('dataExplorer.tableTree')}}
      template(#extra)
        svg.icon.pointer(@click="refreshTableData")
          use(href="#refresh")
      TableList    
  a-tab-pane(key="2") 
    template(#title)
      svg.icon 
        use(href="#code")
    a-card(:bordered="false").tree-card
      template(#title)
        svg.card-icon
          use(href="#code")
        span {{$t('dataExplorer.scripts')}}
      template(#extra)
        a-button(@click="createNewScript()") {{$t('dataExplorer.create')}}
      ScriptsList
</template>

<script lang="ts" name="ListTabs" setup>
  import usePythonCode from '@/hooks/python-code'
  import ScriptsList from './scripts-list.vue'

  const { fetchDataBaseTables: refreshTableData } = useDataBaseStore()
  const { createNewScript } = usePythonCode()
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
