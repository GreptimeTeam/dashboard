<template lang="pug">
.field-filter
  span.field-filter-label {{ t('drilldown.logs.fieldFilter') }}
  DrilldownFilterCombobox(suggest-mode="fields")
</template>

<script setup lang="ts">
  import { useI18n } from 'vue-i18n'
  import DrilldownFilterCombobox from '../components/drilldown-filter-combobox.vue'

  const { t } = useI18n()
</script>

<style scoped lang="less">
  .field-filter {
    display: inline-flex;
    flex: 1 1 auto;
    flex-wrap: nowrap;
    align-items: center;
    gap: var(--gpt-gap-md);
    min-width: 0;
    max-width: 100%;
  }

  .field-filter-label {
    flex-shrink: 0;
    font-size: var(--gpt-font-base);
    font-weight: var(--gpt-font-weight-control);
    color: var(--gpt-text-primary, var(--color-text-1));
    line-height: 1;
    white-space: nowrap;
  }

  // Keep combobox width floor aligned with Levels select.
  .field-filter :deep(.filter-combobox) {
    min-width: 200px;
  }
</style>
