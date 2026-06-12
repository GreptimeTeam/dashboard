<template lang="pug">
a-space.log-time-pagination-wrap(v-if="pages.length" :size="4")
  .log-time-pagination
    a-tooltip(position="top" :content="$t('logsQuery.older')")
      button.log-time-pagination__nav(type="button" :disabled="leftDisabled || olderLoading" @click="loadOlder")
        icon-loading(v-if="olderLoading" spin)
        icon-left(v-else)
    a-dropdown(trigger="click" @select="handleSelect")
      a-tooltip(position="top" :content="$t('logsQuery.clickToQuery')")
        button.log-time-pagination__trigger(type="button")
          icon-loading.log-time-pagination__trigger-loading(v-if="triggerLoading" spin)
          span.log-time-pagination__label {{ currPage.label }}
          icon-down.log-time-pagination__chevron
      template(#content)
        a-doption(
          v-for="(page, index) in pages"
          :key="pageKey(page, index)"
          :value="index"
          :class="{ 'log-time-pagination__option--active': isActive(page) }"
        )
          a-space(:size="4")
            icon-loading(v-if="page.loading" spin)
            span {{ page.label }}
    a-tooltip(position="top" :content="$t('logsQuery.newer')")
      button.log-time-pagination__nav(type="button" :disabled="rightDisabled || newerLoading" @click="loadNewer")
        icon-loading(v-if="newerLoading" spin)
        icon-right(v-else)
  a-tooltip(position="top" :content="$t('logsQuery.timeRangePagination')")
    a-button.btn-hint.gpt-btn-toolbar(type="text" size="small")
      icon-info-circle
</template>

<script setup lang="ts" name="LogTimePagination">
  import type { LogTimePageRange } from '@/hooks/use-log-time-pagination'
  import { computed } from 'vue'

  const props = defineProps<{
    pages: LogTimePageRange[]
    currPage: LogTimePageRange
    currPageIndex: number
    olderLoading: boolean
    newerLoading: boolean
    leftDisabled: boolean
    rightDisabled: boolean
    loadOlder: () => void | Promise<void>
    loadNewer: () => void | Promise<void>
    selectPage: (index: number) => void | Promise<void>
  }>()

  const triggerLoading = computed(() => {
    const index = props.currPageIndex
    if (index < 0) {
      return false
    }
    return Boolean(props.pages[index]?.loading)
  })

  function pageKey(page: LogTimePageRange, index: number) {
    return `${page.start}-${page.end}-${index}`
  }

  function isActive(page: LogTimePageRange) {
    return page.start === props.currPage.start && page.end === props.currPage.end
  }

  function handleSelect(index: number | string | Record<string, unknown> | undefined) {
    if (typeof index !== 'number') {
      return
    }
    if (index === props.currPageIndex) {
      return
    }
    props.selectPage(index)
  }
</script>

<style scoped lang="less">
  .log-time-pagination-wrap {
    align-items: center;
  }

  .log-time-pagination {
    display: inline-flex;
    align-items: stretch;
    border: 1px solid var(--gpt-border-default);
    border-radius: var(--gpt-radius-sm);
    background-color: var(--gpt-bg-panel);
    overflow: hidden;
  }

  .log-time-pagination__nav,
  .log-time-pagination__trigger {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    margin: 0;
    padding: 0;
    border: none;
    background: transparent;
    color: var(--gpt-text-secondary);
    cursor: pointer;
    font: inherit;
    line-height: 1;
    transition: color 0.2s ease, background-color 0.2s ease;

    &:hover:not(:disabled) {
      color: var(--gpt-brand-900);
      background-color: var(--gpt-nav-active-bg);
    }

    &:disabled {
      color: var(--gpt-text-muted);
      cursor: not-allowed;
      opacity: 0.6;
    }
  }

  .log-time-pagination__nav {
    min-width: var(--gpt-control-height-sm);
    min-height: var(--gpt-control-height-sm);
    border-right: 1px solid var(--gpt-border-default);

    &:last-of-type {
      border-right: none;
      border-left: 1px solid var(--gpt-border-default);
    }
  }

  .log-time-pagination__trigger {
    gap: var(--gpt-gap-xs);
    min-width: 140px;
    max-width: 220px;
    padding: var(--gpt-gap-xs) var(--gpt-gap-md);
    border-right: 1px solid var(--gpt-border-default);
  }

  .log-time-pagination__trigger-loading {
    flex-shrink: 0;
  }

  .log-time-pagination__label {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-family: var(--font-mono);
    font-size: var(--gpt-font-base);
    color: var(--gpt-text-primary);
  }

  .log-time-pagination__chevron {
    flex-shrink: 0;
    font-size: 12px;
    color: var(--gpt-text-muted);
  }

  .btn-hint {
    color: var(--gpt-text-muted);
    cursor: help;
    transition: color 0.2s ease;

    &:hover {
      color: var(--gpt-link-color);
    }
  }

  :deep(.log-time-pagination__option--active) {
    color: var(--gpt-text-inverse);
    background-color: var(--gpt-brand-900);
    font-weight: 500;
  }
</style>
