<template lang="pug">
.metric-chart-list
  a-spin.spin-wrap(:loading="loading")
    .metric-chart-scroll(ref="scrollRootRef")
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
          .metric-cards
            MetricChartCard(
              v-for="name in group.names"
              :key="name"
              :metric-name="name"
              :scroll-root="scrollRoot"
              :color-index="colorIndexByName.get(name) ?? 0"
            )
</template>

<script setup lang="ts">
  import { computed, ref } from 'vue'
  import { useI18n } from 'vue-i18n'
  import { METRIC_NAMES_LIMIT } from '@/api/metrics'
  import type { MetricGroup } from '@/observability/metrics/catalog'
  import MetricChartCard from './metric-chart-card.vue'

  const props = defineProps<{
    loading: boolean
    error: string | null
    truncated: boolean
    groups: MetricGroup[]
  }>()

  const { t } = useI18n()

  const metricLimit = METRIC_NAMES_LIMIT
  const scrollRootRef = ref<HTMLElement | null>(null)
  const scrollRoot = scrollRootRef

  // Grafana MetricsList: each card gets fixedColorIndex from list order.
  const colorIndexByName = computed(() => {
    const map = new Map<string, number>()
    let index = 0
    props.groups.forEach((group) => {
      group.names.forEach((name) => {
        map.set(name, index)
        index += 1
      })
    })
    return map
  })
</script>

<style scoped lang="less">
  .metric-chart-list {
    display: flex;
    flex: 1 1 0;
    flex-direction: column;
    min-height: 0;
    height: 100%;
    overflow: hidden;

    :deep(> .arco-spin) {
      display: flex;
      flex: 1 1 0;
      flex-direction: column;
      width: 100%;
      min-height: 0;
      height: 100%;
      overflow: hidden;
    }
  }

  .spin-wrap {
    display: flex;
    flex: 1 1 0;
    flex-direction: column;
    min-height: 0;
    width: 100%;

    :deep(.arco-spin-children) {
      display: flex;
      flex: 1 1 0;
      flex-direction: column;
      min-height: 0;
      height: 100%;
      overflow: hidden;
    }
  }

  .metric-chart-scroll {
    flex: 1 1 0;
    min-height: 0;
    overflow: auto;
    padding: 12px 16px 16px;
    background: var(--gpt-bg-app);
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

  .metric-cards {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 12px;

    @media (max-width: 1400px) {
      grid-template-columns: repeat(3, minmax(0, 1fr));
    }

    @media (max-width: 1024px) {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    @media (max-width: 640px) {
      grid-template-columns: minmax(0, 1fr);
    }
  }
</style>
