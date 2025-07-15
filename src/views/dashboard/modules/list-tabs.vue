<template lang="pug">
a-tabs.sider-tabs(v-model:active-key="tabActiveKey" type="rounded" :class="{ 'one-tab': tabs.length === 1 }")
  a-tab-pane(v-for="(item, index) in tabs" :key="index" :title="item.title")
    a-card.tree-card(:bordered="false")
      component(:is="item.component")
</template>

<script lang="ts" name="ListTabs" setup>
  import ScriptsList from './scripts-list.vue'

  const props = defineProps<{
    has: string[]
  }>()

  const tabActiveKey = ref(props.has.length - 1)
  const tabsConfig = [
    {
      title: 'Scripts',
      component: ScriptsList,
    },
  ]

  const tabs = computed(() => {
    return tabsConfig.filter((tab) => props.has.includes(tab.title))
  })
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
