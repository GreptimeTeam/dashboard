<template lang="pug">
a-space
  template(v-for="item in props.items")
    template(v-if="isVNode(item)")
      span.item
        component(:is="item")
    template(v-else)
      a-space.item(size="mini" @click="(evt) => item.onClick && item.onClick(item, evt)")
        component(v-if="item.icon" :is="item.icon")
        span(v-if="item.text") {{ item.text }}
</template>

<script setup name="StatusList" lang="ts">
  import type { StatusContentType } from '@/store/modules/status-bar'
  import { isVNode } from 'vue'

  const props = defineProps<{
    items: StatusContentType[]
  }>()
</script>

<style lang="less" scoped>
  .item {
    padding: 0 4px;
    font-size: 11px;
    color: #170c2c;
  }
</style>
