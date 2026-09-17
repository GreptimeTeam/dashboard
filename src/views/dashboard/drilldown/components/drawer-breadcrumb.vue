<template lang="pug">
nav.drawer-breadcrumb(:aria-label="t('drilldown.nav.breadcrumb')")
  a-breadcrumb
    a-breadcrumb-item(v-for="(item, index) in items" :key="`${index}-${item.label}`")
      button.drawer-crumb-link(v-if="item.onSelect" type="button" @click="item.onSelect") {{ item.label }}
      span.drawer-crumb-current(v-else :class="{ 'is-mono': item.mono }" :title="item.label") {{ item.label }}
</template>

<script setup lang="ts">
  import { useI18n } from 'vue-i18n'

  type DrawerCrumb = {
    label: string
    onSelect?: () => void
    mono?: boolean
  }

  defineOptions({
    name: 'DrawerBreadcrumb',
  })

  defineProps<{
    items: DrawerCrumb[]
  }>()

  const { t } = useI18n()
</script>

<style scoped lang="less">
  .drawer-breadcrumb {
    display: flex;
    flex: 1 1 auto;
    min-width: 0;

    :deep(.arco-breadcrumb) {
      display: flex;
      align-items: baseline;
      min-width: 0;
      line-height: 1.3;
    }

    :deep(.arco-breadcrumb-item) {
      display: inline-flex;
      align-items: baseline;
      min-width: 0;
      color: var(--color-text-3);

      &:not(:last-child) {
        flex-shrink: 0;
      }

      &:last-child {
        overflow: hidden;
        color: var(--color-text-1);
      }
    }

    :deep(.arco-breadcrumb-item-separator) {
      color: var(--color-text-4);
    }
  }

  .drawer-crumb-link {
    padding: 0;
    border: 0;
    background: transparent;
    color: var(--color-text-2);
    font: inherit;
    line-height: inherit;
    cursor: pointer;

    &:hover {
      color: var(--color-primary, var(--color-text-1));
    }
  }

  .drawer-crumb-current {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;

    &.is-mono {
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace;
      font-size: var(--gpt-font-md);
      font-weight: var(--gpt-font-weight-control);
    }
  }
</style>
