<template lang="pug">
.metrics-main-toolbar
  a-input-search(
    v-model="searchModel"
    size="small"
    allow-clear
    style="max-width: 280px"
    :placeholder="t('drilldown.main.searchPlaceholder')"
  )
  a-select(
    v-model="sortModel"
    size="small"
    style="width: 160px"
    :options="sortOptions"
  )
</template>

<script setup lang="ts">
  import { computed } from 'vue'
  import { useI18n } from 'vue-i18n'
  import type { MetricsSortOption } from '@/observability/metrics/catalog'

  const searchModel = defineModel<string>('search', { default: '' })
  const sortModel = defineModel<MetricsSortOption>('sort', { default: 'default' })

  const { t } = useI18n()

  const sortOptions = computed(() => [
    { label: t('drilldown.main.sortDefault'), value: 'default' },
    { label: t('drilldown.main.sortAsc'), value: 'asc' },
    { label: t('drilldown.main.sortDesc'), value: 'desc' },
  ])
</script>

<style scoped lang="less">
  .metrics-main-toolbar {
    display: flex;
    align-items: center;
    gap: 12px;
    width: 100%;
  }
</style>
