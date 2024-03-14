<template lang="pug">
a-space
  template(v-for="itemKey in Object.keys(props.items)")
    template(v-for="item in props.items[itemKey]")
      template(v-if="item.type")
        span.item
          component(:is="item")
      template(v-else)
        a-space.item(size="mini" @click="(evt) => item.onClick && item.onClick(item, evt)")
          component(v-if="item.icon" :is="item.icon")
          | {{ item.text }}
</template>

<script setup name="StatusBarList" lang="ts">
  import type { StatusItem } from '@/store/modules/app/types'

  const props = defineProps<{
    items: Record<string, Array<StatusItem>>
  }>()
</script>

<style lang="less" scoped>
  .item {
    padding: 0 4px;
    font-size: 11px;
    color: #170c2c;
    &:hover {
      background-color: var(--color-fill-3);
    }
  }
</style>
