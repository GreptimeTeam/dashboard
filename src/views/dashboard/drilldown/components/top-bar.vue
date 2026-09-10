<template lang="pug">
.toolbar.drilldown-top-bar
  .page-identity
    .title-row
      span.page-title {{ t('drilldown.pageTitle') }}
      nav.signal-text-nav(aria-label="Drilldown signal")
        button.signal-link(
          v-for="item in signalItems"
          :key="item.value"
          type="button"
          :class="{ active: signal === item.value }"
          :aria-current="signal === item.value ? 'page' : undefined"
          @click="setSignal(item.value)"
        ) {{ item.label }}
  .shared-context
    DrilldownFilterBar
    a-space
      TimeRangeSelect(
        v-model:time-length="time"
        v-model:time-range="rangeTime"
        button-type="outline"
        button-size="medium"
        :show-any-time="false"
      )
      a-tooltip(mini :content="t('common.refresh')")
        a-button.gpt-btn-outline-control(
          type="outline"
          size="medium"
          :aria-label="t('common.refresh')"
          @click="handleRefresh"
        )
          template(#icon)
            icon-refresh
</template>

<script setup lang="ts">
  import { computed } from 'vue'
  import { useI18n } from 'vue-i18n'
  import TimeRangeSelect from '@/components/time-range-select/index.vue'
  import { useDrilldownContext } from '@/observability/context'
  import type { DrilldownSignal } from '@/observability/types'
  import DrilldownFilterBar from './filter-bar.vue'

  const { t } = useI18n()
  const { signal, time, rangeTime, triggerRefresh, setSignal } = useDrilldownContext()

  const signalItems = computed(() => [
    { value: 'metrics' as DrilldownSignal, label: t('drilldown.signals.metrics') },
    { value: 'logs' as DrilldownSignal, label: t('drilldown.signals.logs') },
    { value: 'traces' as DrilldownSignal, label: t('drilldown.signals.traces') },
  ])

  const handleRefresh = () => {
    triggerRefresh()
  }
</script>

<style scoped lang="less">
  // Beat `.query-layout.query-layout--stack .toolbar { align-items: center }`
  // so links stretch and the ink can be anchored to the toolbar border.
  .toolbar.drilldown-top-bar {
    align-items: stretch;
    flex-wrap: wrap;
    height: auto;
    min-height: var(--gpt-size-region-bar);
    row-gap: var(--gpt-gap-sm);
  }

  .page-identity {
    display: flex;
    flex-shrink: 0;
    align-self: stretch;
    align-items: stretch;
    min-width: 0;
  }

  .title-row {
    display: flex;
    align-items: stretch;
    gap: 20px;
    min-width: 0;
  }

  .page-title {
    display: inline-flex;
    flex-shrink: 0;
    align-items: center;
    font-family: var(--font-family-base);
    font-size: var(--gpt-font-xl);
    font-weight: 700;
    line-height: 1.2;
    color: var(--gpt-text-primary, var(--color-text-1));
    white-space: nowrap;
  }

  .signal-text-nav {
    display: inline-flex;
    align-items: stretch;
    gap: 14px;
    min-width: 0;
  }

  .signal-link {
    position: relative;
    display: inline-flex;
    align-items: center;
    padding: 0;
    border: 0;
    background: transparent;
    font-family: var(--font-family-base);
    font-size: 14px;
    font-weight: 500;
    line-height: 1.2;
    color: var(--color-text-3);
    white-space: nowrap;
    cursor: pointer;
  }

  .signal-link:hover {
    color: var(--color-text-2);
  }

  .signal-link.active {
    font-weight: 600;
    color: var(--color-primary, var(--color-text-1));
  }

  // Stretched link bottom = toolbar content edge; drop through padding + border
  // so the 2px ink sits on the toolbar bottom border.
  .signal-link.active::after {
    content: '';
    position: absolute;
    right: 0;
    bottom: calc(-1 * var(--gpt-toolbar-padding-y) - 1px);
    left: 0;
    height: 2px;
    background: var(--color-primary, var(--color-text-1));
  }

  .shared-context {
    display: flex;
    flex: 1 1 auto;
    align-items: center;
    justify-content: flex-end;
    gap: var(--gpt-gap-md);
    min-width: 0;
    margin-left: auto;

    > .arco-space {
      flex-shrink: 0;
    }
  }
</style>
