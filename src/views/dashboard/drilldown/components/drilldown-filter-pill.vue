<template lang="pug">
.filter-pill
  button.filter-pill__body(type="button" @click="emit('edit')")
    span.filter-pill__segment.filter-pill__key {{ filter.key }}
    span.filter-pill__segment.filter-pill__op(@click.stop="emit('editOperator')") {{ filter.op }}
    span.filter-pill__segment.filter-pill__value(:title="filter.value" @click.stop="emit('editValue')") {{ filter.value }}
  button.filter-pill__remove(type="button" :aria-label="labels.remove" @click.stop="emit('remove')")
    icon-close
</template>

<script setup lang="ts">
  import { computed } from 'vue'
  import { useI18n } from 'vue-i18n'
  import { IconClose } from '@arco-design/web-vue/es/icon'
  import type { DrilldownFilter } from '@/observability/types'

  defineProps<{
    filter: DrilldownFilter
  }>()

  const emit = defineEmits<{
    edit: []
    editOperator: []
    editValue: []
    remove: []
  }>()

  const { t } = useI18n()

  const labels = computed(() => ({
    remove: t('drilldown.filters.remove'),
  }))
</script>

<style scoped lang="less">
  .filter-pill {
    display: inline-flex;
    align-items: center;
    max-width: 280px;
    height: 22px;
    margin: 1px 0;
    border: 1px solid var(--color-border-2);
    border-radius: var(--gpt-radius-sm);
    background: var(--color-fill-2);
    font-size: 12px;
    line-height: 1;
    vertical-align: middle;
    flex-shrink: 0;
  }

  .filter-pill__body {
    display: inline-flex;
    align-items: center;
    min-width: 0;
    flex: 1;
    padding: 0;
    border: none;
    background: transparent;
    cursor: pointer;
    color: inherit;
    font: inherit;
  }

  .filter-pill__segment {
    padding: 0 5px;
    line-height: 20px;
    white-space: nowrap;
  }

  .filter-pill__key {
    color: var(--color-text-1);
    font-weight: 600;
  }

  .filter-pill__op,
  .filter-pill__value {
    color: var(--color-text-2);

    &:hover {
      background: var(--color-fill-3);
      color: rgb(var(--primary-6));
    }
  }

  .filter-pill__value {
    max-width: 120px;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .filter-pill__remove {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    width: 20px;
    height: 20px;
    padding: 0;
    border: none;
    background: transparent;
    color: var(--color-text-3);
    cursor: pointer;

    &:hover {
      color: var(--color-text-1);
      background: var(--color-fill-3);
    }
  }
</style>
