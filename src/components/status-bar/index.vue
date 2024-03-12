<template lang="pug">
a-space.status-bar
  template(v-for="itemType in Object.keys(statusBar)")
    a-link(size="mini" v-for="item in statusBar[itemType]" @click="() => item.action && item.action(item)")
      | {{ item.msg }}
</template>

<script setup name="StatusBar" lang="ts">
  const { statusBar } = useAppStore()
</script>

<style lang="less" scoped>
  .status-bar {
    background-color: var(--color-white);
    height: 24px;
    line-height: 24px;
    display: flex;
    justify-content: right;
  }
</style>
