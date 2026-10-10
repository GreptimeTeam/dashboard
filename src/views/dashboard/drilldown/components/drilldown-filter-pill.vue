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
    max-width: min(420px, 100%);
    height: 22px;
    margin: 0;
    border: 1px solid var(--gpt-border-default);
    border-radius: var(--gpt-radius-sm);
    background: var(--gpt-bg-surface);
    font-size: var(--gpt-font-base);
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
    padding: 0 var(--gpt-gap-xs);
    line-height: 20px;
    white-space: nowrap;
  }

  .filter-pill__key,
  .filter-pill__value {
    color: var(--gpt-text-primary);
  }

  .filter-pill__key {
    font-weight: var(--gpt-font-weight-control);
  }

  .filter-pill__op {
    color: var(--gpt-text-secondary);
  }

  .filter-pill__op:hover,
  .filter-pill__value:hover {
    background: var(--gpt-nav-active-bg);
    color: var(--gpt-main-purple);
  }

  .filter-pill__value {
    max-width: 240px;
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
    color: var(--gpt-text-muted);
    cursor: pointer;

    &:hover {
      color: var(--gpt-text-primary);
      background: var(--gpt-nav-active-bg);
    }
  }
</style>
