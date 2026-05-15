<template lang="pug">
.paginated-data-table
  DataTable(v-bind="attrsWithPagedData")
    template(v-for="(_, name) in $slots" #[name]="slotProps")
      slot(v-bind="slotProps || {}" :name="name")
  .grid-pagination(v-if="totalRows > 0")
    a-pagination(
      size="mini"
      :total="totalRows"
      :current="currentPage"
      :page-size="pageSize"
      :show-page-size="true"
      :show-total="true"
      :show-jumper="true"
      @change="handlePageChange"
      @page-size-change="handlePageSizeChange"
    )
</template>

<script lang="ts" setup>
  import { ref, computed, watch, useAttrs } from 'vue'
  import DataTable from '@/components/data-table/index.vue'

  defineOptions({
    inheritAttrs: false,
  })

  const attrs = useAttrs()

  const currentPage = ref(1)
  const pageSize = ref(20)

  const fullData = computed(() => (attrs.data as Record<string, unknown>[]) ?? [])
  const totalRows = computed(() => fullData.value.length)

  const pagedData = computed(() => {
    const start = (currentPage.value - 1) * pageSize.value
    return fullData.value.slice(start, start + pageSize.value)
  })

  const attrsWithPagedData = computed(
    () =>
      ({
        ...attrs,
        data: pagedData.value,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any)
  )

  const handlePageChange = (page: number) => {
    currentPage.value = page
  }

  const handlePageSizeChange = (size: number) => {
    pageSize.value = size
    currentPage.value = 1
  }

  watch(fullData, () => {
    currentPage.value = 1
  })
</script>

<style lang="less" scoped>
  .paginated-data-table {
    height: 100%;
    display: flex;
    flex-direction: column;
    min-height: 0;
    background: var(--gpt-bg-header);

    :deep(.data-table-container) {
      flex: 1;
      min-height: 0;
    }
  }

  .grid-pagination {
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
