<template lang="pug">
.breakdown-value-card
  .card-header
    span.card-title {{ labelKey }}="{{ value }}"
    a-button(type="outline" size="mini" @click="addToFilter")
      | {{ t('drilldown.filters.addToFilter') }}
</template>

<script setup lang="ts">
  import { useI18n } from 'vue-i18n'
  import { useDrilldownContext } from '@/observability/context'

  const props = defineProps<{
    labelKey: string
    value: string
  }>()

  const { t } = useI18n()
  const ctx = useDrilldownContext()

  const addToFilter = () => {
    if (!props.value || props.value === '<unspecified>') {
      return
    }
    ctx.appendFilter({ key: props.labelKey, op: '=', value: props.value })
  }
</script>

<style scoped lang="less">
  .breakdown-value-card {
    border: 1px solid var(--color-border-2);
    border-radius: 8px;
    padding: 12px;
    background: var(--color-bg-2);
  }

  .card-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }

  .card-title {
    font-size: 12px;
    color: var(--color-text-1);
    font-family: var(--vp-font-family-base);
  }
</style>
