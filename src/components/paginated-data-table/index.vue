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

    :deep(.data-table-container) {
      flex: 1;
      min-height: 0;
    }
  }

  .grid-pagination {
    display: flex;
    justify-content: flex-end;
    align-items: center;
    padding: 4px 8px;
    border-top: 1px solid var(--color-border-2);
    min-height: 34px;
    flex-shrink: 0;
  }
</style>
