<template lang="pug">
.metric-chart-list(:class="{ 'metric-chart-list--external-scroll': useExternalScroll }")
  a-spin.spin-wrap(:loading="loading")
    .metric-chart-scroll(ref="internalScrollRootRef")
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
      a-empty(v-if="!loading && !error && !groups.length" :description="resolvedEmptyDescription")
      .metric-groups(v-else)
        section.metric-group(v-for="group in visibleGroups" :key="group.key")
          .group-header(v-if="group.label")
            span.group-title {{ group.label }}
            span.group-count {{ group.names.length }}
          .metric-cards
            MetricChartCard(
              v-for="name in group.names"
              :key="name"
              :metric-name="name"
              :scroll-root="effectiveScrollRoot"
              :color-index="colorIndexByName.get(name) ?? 0"
            )
        .batch-sentinel(ref="sentinelRef" v-show="hasMore")
</template>

<script setup lang="ts">
  import { computed, isRef, ref, type Ref } from 'vue'
  import { useI18n } from 'vue-i18n'
  import { METRIC_NAMES_LIMIT } from '@/api/metrics'
  import type { MetricGroup } from '@/observability/metrics/catalog'
  import useScrollBatchReveal from '@/observability/use-scroll-batch-reveal'
  import MetricChartCard from './metric-chart-card.vue'

  const props = defineProps<{
    loading: boolean
    error: string | null
    truncated: boolean
    groups: MetricGroup[]
    /** When set, list does not scroll itself; IntersectionObserver uses this root. */
    scrollRoot?: Ref<HTMLElement | null | undefined> | HTMLElement | null
    emptyDescription?: string
    batchSize?: number
  }>()

  const { t } = useI18n()

  const metricLimit = METRIC_NAMES_LIMIT
  const internalScrollRootRef = ref<HTMLElement | null>(null)
  const useExternalScroll = computed(() => props.scrollRoot !== undefined)

  // Template may unwrap Ref props; accept Ref or element and always expose a computed root.
  const effectiveScrollRoot = computed(() => {
    if (props.scrollRoot !== undefined) {
      return isRef(props.scrollRoot) ? props.scrollRoot.value : props.scrollRoot
    }
    return internalScrollRootRef.value
  })

  const resolvedEmptyDescription = computed(() => props.emptyDescription ?? t('drilldown.main.emptyDescription'))

  const flatNames = computed(() => props.groups.flatMap((group) => group.names))
  const totalCount = computed(() => flatNames.value.length)
  const resetKey = computed(() => flatNames.value.join('\0'))

  const { visibleCount, sentinelRef, hasMore } = useScrollBatchReveal(totalCount, effectiveScrollRoot, {
    batchSize: props.batchSize,
    resetKey,
  })

  const visibleGroups = computed((): MetricGroup[] => {
    let remaining = visibleCount.value
    return props.groups.reduce<MetricGroup[]>((result, group) => {
      if (remaining <= 0) {
        return result
      }
      if (group.names.length <= remaining) {
        remaining -= group.names.length
        result.push(group)
        return result
      }
      result.push({
        ...group,
        names: group.names.slice(0, remaining),
      })
      remaining = 0
      return result
    }, [])
  })

  // Grafana MetricsList: each card gets fixedColorIndex from full list order.
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

  .metric-chart-list--external-scroll {
    height: auto;
    overflow: visible;

    :deep(> .arco-spin) {
      height: auto;
      overflow: visible;
    }

    .spin-wrap {
      height: auto;
      overflow: visible;

      :deep(.arco-spin-children) {
        height: auto;
        overflow: visible;
      }
    }

    .metric-chart-scroll {
      overflow: visible;
      height: auto;
      flex: none;
      padding: 0;
      background: transparent;
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
    // Section rhythm between prefix groups — one step above card gap.
    gap: var(--gpt-gap-lg);
  }

  .group-header {
    display: flex;
    align-items: center;
    gap: var(--gpt-gap-md);
    margin-bottom: var(--gpt-gap-md);
    padding-bottom: var(--gpt-gap-sm);
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
    // Grafana MetricsList SceneCSSGridLayout default: rowGap/columnGap = spacing(1) → 8px.
    gap: var(--gpt-gap-md);

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

  .batch-sentinel {
    width: 100%;
    height: 1px;
  }
</style>
