<template lang="pug">
.grid-pagination
  a-pagination(
    size="mini"
    :total="total"
    :current="current"
    :page-size="pageSize"
    :show-page-size="true"
    :show-total="true"
    :show-jumper="true"
    @change="(page) => emit('update:current', page)"
    @page-size-change="(size) => emit('update:pageSize', size)"
  )
</template>

<script lang="ts" setup>
  defineProps<{
    total: number
    current: number
    pageSize: number
  }>()

  const emit = defineEmits<{
    (e: 'update:current', value: number): void
    (e: 'update:pageSize', value: number): void
  }>()
</script>

<style lang="less" scoped>
  .grid-pagination {
    display: flex;
    justify-content: flex-end;
    align-items: center;
    padding: 4px 8px;
    border-top: 1px solid var(--color-border-2);
    min-height: 34px;
  }
</style>
