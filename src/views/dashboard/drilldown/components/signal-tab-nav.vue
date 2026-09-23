<template lang="pug">
nav.signal-tab-nav(v-if="mode === 'navigation'" :aria-label="ariaLabel" :class="{ 'signal-tab-nav--navigation': true }")
  button.signal-tab-nav__item.signal-tab-nav__item--navigation(
    v-for="item in items"
    :key="item.value"
    type="button"
    :class="{ 'is-active': item.value === modelValue }"
    :aria-current="item.value === modelValue ? 'page' : undefined"
    @click="select(item.value)"
  ) {{ item.label }}

nav.signal-tab-nav.signal-tab-nav--tabs(v-else role="tablist" :aria-label="ariaLabel")
  button.signal-tab-nav__item.signal-tab-nav__item--tab(
    v-for="item in items"
    :key="item.value"
    type="button"
    role="tab"
    :class="{ 'is-active': item.value === modelValue }"
    :aria-selected="item.value === modelValue"
    @click="select(item.value)"
  ) {{ item.label }}
</template>

<script setup lang="ts">
  export interface SignalTabItem {
    value: string
    label: string
  }

  withDefaults(
    defineProps<{
      items: SignalTabItem[]
      modelValue: string
      ariaLabel: string
      mode?: 'navigation' | 'tabs'
    }>(),
    { mode: 'tabs' }
  )

  const emit = defineEmits<{
    'update:modelValue': [value: string]
  }>()

  const select = (value: string) => {
    emit('update:modelValue', value)
  }
</script>

<style scoped lang="less">
  .signal-tab-nav {
    display: inline-flex;
    align-items: stretch;
    min-width: 0;
  }

  .signal-tab-nav__item {
    position: relative;
    display: inline-flex;
    align-items: center;
    border: 0;
    background: transparent;
    font-family: inherit;
    white-space: nowrap;
    cursor: pointer;
  }

  .signal-tab-nav__item--navigation {
    color: var(--gpt-text-secondary);
    font-size: var(--gpt-font-lg);
    font-weight: var(--gpt-font-weight-medium);
    line-height: 1.2;

    &:hover {
      color: var(--gpt-main-purple);
    }

    &.is-active {
      color: var(--gpt-main-purple);
      font-weight: var(--gpt-font-weight-control);
    }

    &.is-active::after {
      position: absolute;
      right: 0;
      bottom: calc(-1 * var(--gpt-toolbar-padding-y) - 1px);
      left: 0;
      height: var(--gpt-gap-2xs);
      content: '';
      background: var(--gpt-main-purple);
    }
  }

  .signal-tab-nav--navigation {
    gap: var(--gpt-gap-xl);
  }

  .signal-tab-nav--tabs {
    height: 37px;
    flex-shrink: 0;
  }

  .signal-tab-nav__item--tab {
    height: 100%;
    padding: 0 var(--gpt-page-padding-x);
    color: var(--gpt-text-secondary);
    font-size: var(--gpt-font-base);
    line-height: 1;

    &.is-active {
      color: var(--gpt-main-purple);
      font-weight: var(--gpt-font-weight-control);
    }

    &.is-active::after {
      position: absolute;
      right: 0;
      bottom: 0;
      left: 0;
      height: 2px;
      content: '';
      background: var(--gpt-main-purple);
    }
  }
</style>
