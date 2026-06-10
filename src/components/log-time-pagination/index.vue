<template lang="pug">
a-space(v-if="pages.length")
  a-button.btn.gpt-btn-toolbar(
    size="small"
    :loading="olderLoading"
    :disabled="leftDisabled"
    @click="loadOlder"
  )
    icon-left
    | {{ $t('logsQuery.older') }}
  a-space(style="overflow-x: auto; max-width: 55vw")
    a-tooltip(
      v-for="(page, index) in pages"
      :key="index"
      position="top"
      :content="$t('logsQuery.clickToQuery')"
    )
      a-button.btn.gpt-btn-toolbar.gpt-btn-toolbar-mono(
        type="text"
        size="small"
        :loading="page.loading"
        :class="{ active: page.start === currPage.start && page.end === currPage.end }"
        @click="() => loadPage(page.start, page.end, index)"
      )
        | {{ page.label }}
  a-button.btn.gpt-btn-toolbar(
    size="small"
    :loading="newerLoading"
    :disabled="rightDisabled"
    @click="loadNewer"
  )
    | {{ $t('logsQuery.newer') }}
    icon-right
  a-tooltip(position="top" :content="$t('logsQuery.timeRangePagination')")
    a-button.btn-hint.gpt-btn-toolbar(type="text" size="small")
      icon-info-circle
</template>

<script setup lang="ts" name="LogTimePagination">
  import type { LogTimePageRange } from '@/hooks/use-log-time-pagination'

  defineProps<{
    pages: LogTimePageRange[]
    currPage: LogTimePageRange
    olderLoading: boolean
    newerLoading: boolean
    leftDisabled: boolean
    rightDisabled: boolean
    loadOlder: () => void | Promise<void>
    loadNewer: () => void | Promise<void>
    loadPage: (start: number | string, end: number | string, pageIndex: number) => void | Promise<void>
  }>()
</script>

<style scoped lang="less">
  .btn-hint {
    color: var(--gpt-text-muted);
    cursor: help;
    transition: color 0.2s ease;

    &:hover {
      color: var(--gpt-link-color);
    }
  }

  :deep(.arco-space) {
    gap: var(--gpt-gap-xs);
  }
</style>
