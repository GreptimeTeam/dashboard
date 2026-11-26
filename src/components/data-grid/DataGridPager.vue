<template lang="pug">
.dg-pager(v-if="total > 0")
  a-pagination(
    size="mini"
    :simple="simple"
    :total="total"
    :current="current"
    :page-size="pageSize"
    :page-size-options="pageSizeOptions"
    :show-page-size="!simple"
    :show-total="!simple"
    :show-jumper="!simple"
    @change="(page) => emit('update:current', page)"
    @page-size-change="(size) => emit('update:pageSize', size)"
  )
</template>

<script setup lang="ts">
  withDefaults(
    defineProps<{
      total: number
      current: number
      pageSize: number
      pageSizeOptions?: number[]
      simple?: boolean
    }>(),
    {
      pageSizeOptions: () => [10, 20, 50, 100],
      simple: false,
    }
  )

  const emit = defineEmits<{
    (e: 'update:current', page: number): void
    (e: 'update:pageSize', size: number): void
  }>()
</script>

<style lang="less" scoped>
  .dg-pager {
    display: flex;
    justify-content: flex-end;
    align-items: center;
    padding: var(--gpt-toolbar-padding);
    border-top: 1px solid var(--gpt-border-default);
    background: var(--gpt-bg-header);
    min-height: 40px;
    flex-shrink: 0;

    :deep(.arco-pagination) {
      color: var(--gpt-text-secondary);
      font-size: 12px;
    }

    :deep(.arco-pagination-total) {
      color: var(--gpt-text-muted);
    }

    :deep(.arco-pagination-item),
    :deep(.arco-pagination-item-previous),
    :deep(.arco-pagination-item-next) {
      height: 24px;
      min-width: 24px;
      border-color: transparent;
      border-radius: var(--gpt-radius-sm);
      color: var(--gpt-text-secondary);
      background: transparent;
      font-weight: 600;
      line-height: 24px;
    }

    :deep(.arco-pagination-item:hover),
    :deep(.arco-pagination-item-previous:not(.arco-pagination-item-disabled):hover),
    :deep(.arco-pagination-item-next:not(.arco-pagination-item-disabled):hover) {
      color: var(--gpt-brand-900);
      background: var(--gpt-nav-active-bg);
    }

    :deep(.arco-pagination-item-active),
    :deep(.arco-pagination-item-active:hover) {
      border-color: var(--gpt-brand-900);
      color: var(--gpt-text-inverse);
      background: var(--gpt-brand-900);
    }

    :deep(.arco-pagination-jumper-input) {
      height: 24px;
      min-width: 48px;
      border-color: var(--gpt-border-strong);
      border-radius: var(--gpt-radius-sm);
      color: var(--gpt-text-primary);
      background: var(--gpt-bg-panel);
      font-weight: 600;
    }

    :deep(.arco-select-view) {
      min-height: 24px;
      border-color: var(--gpt-border-strong);
      border-radius: var(--gpt-radius-sm);
      background: var(--gpt-bg-panel);
    }
  }
</style>
