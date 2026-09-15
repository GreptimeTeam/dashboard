<template lang="pug">
.drilldown-filter-bar
  span.filter-label {{ labels.filters }}
  DrilldownFilterCombobox
</template>

<script setup lang="ts">
  import { computed } from 'vue'
  import { useI18n } from 'vue-i18n'
  import DrilldownFilterCombobox from './drilldown-filter-combobox.vue'

  const { t } = useI18n()

  const labels = computed(() => ({
    filters: t('drilldown.filters.title'),
  }))
</script>

<style scoped lang="less">
  .drilldown-filter-bar {
    display: inline-flex;
    flex: 0 1 auto;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--gpt-gap-md) var(--gpt-gap-lg);
    min-width: 0;
    max-width: min(480px, 100%);
  }

  .filter-label {
    flex-shrink: 0;
    font-size: var(--gpt-font-base);
    font-weight: var(--gpt-font-weight-control);
    color: var(--gpt-text-primary, var(--color-text-1));
    line-height: 1;
    white-space: nowrap;
  }
</style>
