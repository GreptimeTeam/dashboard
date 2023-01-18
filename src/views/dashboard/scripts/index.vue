<template lang="pug">
a-space.layout-content(direction="vertical" fill :size="14")
  a-split.scripts-split(default-size="284px" min="200px")
    template(#first)
      ListTabs
    template(#second) 
      PyEditor
  DataView(v-if="!!results.python.length")
  Log 
</template>

<script lang="ts" name="Scripts" setup>
  import router from '@/router'
  import ListTabs from './list-tabs.vue'

  const { codeType } = storeToRefs(useAppStore())
  const { fetchDataBaseTables: refreshTableData } = useDataBaseStore()
  const { results } = storeToRefs(useCodeRunStore())

  const { name } = router.currentRoute.value

  // TODO: add more code type in the future if needed
  codeType.value = name === 'sql' ? 'sql' : 'python'
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
