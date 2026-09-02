<template lang="pug">
.metric-name-list
  a-spin(style="width: 100%" :loading="loading")
    a-alert(
      v-if="error"
      type="error"
      show-icon
      :title="error"
    )
    a-alert(
      v-else-if="truncated"
      type="warning"
      show-icon
      :title="t('drilldown.main.truncatedTitle')"
      :description="t('drilldown.main.truncatedDescription', { limit: metricLimit })"
    )
    a-empty(v-if="!loading && !error && !groups.length" :description="t('drilldown.main.emptyDescription')")
    .metric-groups(v-else)
      section.metric-group(v-for="group in groups" :key="group.key")
        .group-header(v-if="group.label")
          span.group-title {{ group.label }}
          span.group-count {{ group.names.length }}
        .metric-names
          button.metric-name(
            v-for="name in group.names"
            :key="name"
            type="button"
            :class="{ selected: selectedMetric === name }"
            @click="selectMetric(name)"
          ) {{ name }}
</template>

<script setup lang="ts">
  import { computed } from 'vue'
  import { useI18n } from 'vue-i18n'
  import { METRIC_NAMES_LIMIT } from '@/api/metrics'
  import type { MetricGroup } from '@/observability/metrics/catalog'
  import { rememberRecentMetric } from '@/observability/metrics/recent'
  import { useDrilldownContext } from '@/observability/context'

  const props = defineProps<{
    loading: boolean
    error: string | null
    truncated: boolean
    groups: MetricGroup[]
  }>()

  const { t } = useI18n()
  const { metric } = useDrilldownContext()

  const metricLimit = METRIC_NAMES_LIMIT
  const selectedMetric = computed(() => metric.value)

  const selectMetric = (name: string) => {
    metric.value = name
    rememberRecentMetric(name)
  }
</script>

<style scoped lang="less">
  .metric-name-list {
    display: flex;
    flex: 1;
    flex-direction: column;
    min-height: 0;
    overflow: auto;
    padding: 12px 16px 16px;
  }

  .metric-groups {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .group-header {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 8px;
    padding-bottom: 6px;
    border-bottom: 1px solid var(--color-border-2);
  }

  .group-title {
    font-size: 13px;
    font-weight: 600;
    color: var(--color-text-1);
  }

  .group-count {
    font-size: 12px;
    color: var(--color-text-3);
  }

  .metric-names {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
    gap: 8px;
  }

  .metric-name {
    padding: 8px 10px;
    border: 1px solid var(--color-border-2);
    border-radius: 6px;
    background: var(--color-bg-2);
    color: var(--color-text-1);
    font-size: 12px;
    line-height: 1.4;
    text-align: left;
    cursor: pointer;
    transition: border-color 0.15s ease, background-color 0.15s ease;

    &:hover {
      border-color: rgb(var(--primary-6));
      background: var(--color-fill-1);
    }

    &.selected {
      border-color: rgb(var(--primary-6));
      background: rgb(var(--primary-1));
    }
  }
</style>
