<template lang="pug">
a-layout.layout
  a-layout-sider
    ListTabs
  a-layout-content
    a-space(direction="vertical" fill :size="14")
      PyEditor
      DataView(v-if="!!results.python.length")
      Log 
</template>

<script lang="ts" name="Scripts" setup>
  import ListTabs from './list-tabs.vue'

  const { codeType } = storeToRefs(useAppStore())
  const { getTables: refreshTableData } = useDataBaseStore()
  const { results } = storeToRefs(useCodeRunStore())

  // TODO: add more code type in the future if needed
  codeType.value = 'python'
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
