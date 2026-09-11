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
    gap: 8px;
    min-width: 0;
    max-width: min(520px, 100%);
  }

  .field-filter-label {
    flex-shrink: 0;
    font-size: 12px;
    font-weight: 600;
    color: var(--gpt-text-primary, var(--color-text-1));
    line-height: 1;
    white-space: nowrap;
  }

  // Keep combobox width floor aligned with Levels select.
  .field-filter :deep(.filter-combobox) {
    min-width: 200px;
  }
</style>
