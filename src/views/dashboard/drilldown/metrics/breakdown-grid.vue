<template lang="pug">
.breakdown-grid
  .breakdown-toolbar
    .breakdown-by-label
      span.toolbar-label {{ t('drilldown.breakdown.byLabel') }}
      a-select(
        v-model="groupBySelection"
        allow-clear
        size="small"
        :style="{ width: '220px' }"
        :placeholder="t('drilldown.breakdown.byLabelAll')"
        @change="onGroupByChange"
        @clear="backToAllLabels"
      )
        a-option(:value="ALL_LABELS") {{ t('drilldown.breakdown.byLabelAll') }}
        a-option(v-for="key in labelKeys" :key="key" :value="key") {{ key }}

  a-spin(style="width: 100%" :loading="loading")
    template(v-if="selectedLabel")
      .breakdown-values-grid
        BreakdownValueCard(
          v-for="value in selectedValues"
          :key="value"
          :metric="metric"
          :label-key="selectedLabel"
          :value="value"
          :scroll-root="scrollRoot"
        )
      a-empty(v-if="!selectedValues.length" :description="t('drilldown.breakdown.noValues')")
    template(v-else)
      .breakdown-labels-grid
        BreakdownLabelCard(
          v-for="labelKey in labelKeys"
          :key="labelKey"
          :metric="metric"
          :label-key="labelKey"
          :scroll-root="scrollRoot"
          @select="openLabel(labelKey)"
        )
      a-empty(v-if="!labelKeys.length && !loading" :description="t('drilldown.breakdown.noLabels')")
</template>

<script setup lang="ts">
  import { onMounted, ref, watch, type MaybeRefOrGetter } from 'vue'
  import { useI18n } from 'vue-i18n'
  import { useDrilldownContext } from '@/observability/context'
  import { fetchBreakdownLabelKeys, fetchBreakdownLabelValues } from '@/observability/metrics/breakdown'
  import BreakdownLabelCard from './breakdown-label-card.vue'
  import BreakdownValueCard from './breakdown-value-card.vue'

  const ALL_LABELS = '__all__'

  const props = defineProps<{
    metric: string
    scrollRoot: MaybeRefOrGetter<HTMLElement | null | undefined>
  }>()

  const { t } = useI18n()
  const ctx = useDrilldownContext()

  const loading = ref(false)
  const labelKeys = ref<string[]>([])
  const selectedLabel = ref<string | undefined>()
  const selectedValues = ref<string[]>([])
  const groupBySelection = ref<string | undefined>(ALL_LABELS)

  const backToAllLabels = () => {
    selectedLabel.value = undefined
    selectedValues.value = []
    groupBySelection.value = ALL_LABELS
  }

  const openLabel = async (labelKey: string) => {
    selectedLabel.value = labelKey
    groupBySelection.value = labelKey
    loading.value = true
    try {
      selectedValues.value = await fetchBreakdownLabelValues(ctx, props.metric, labelKey)
    } finally {
      loading.value = false
    }
  }

  const loadLabels = async () => {
    loading.value = true
    try {
      labelKeys.value = await fetchBreakdownLabelKeys(ctx, props.metric)
      if (
        groupBySelection.value &&
        groupBySelection.value !== ALL_LABELS &&
        !labelKeys.value.includes(groupBySelection.value)
      ) {
        backToAllLabels()
      }
    } finally {
      loading.value = false
    }
  }

  const onGroupByChange = (value: string | undefined) => {
    if (!value || value === ALL_LABELS) {
      backToAllLabels()
      return
    }
    openLabel(value)
  }

  onMounted(() => {
    loadLabels()
  })

  watch(
    () => [ctx.filters.value, ctx.time.value, ctx.rangeTime.value[0], ctx.rangeTime.value[1], ctx.refreshKey.value],
    () => {
      const keepLabel = groupBySelection.value !== ALL_LABELS ? groupBySelection.value : undefined
      selectedLabel.value = undefined
      selectedValues.value = []
      loadLabels().then(() => {
        if (keepLabel && labelKeys.value.includes(keepLabel)) {
          openLabel(keepLabel)
        } else {
          groupBySelection.value = ALL_LABELS
        }
      })
    },
    { deep: true }
  )
</script>

<style scoped lang="less">
  .breakdown-grid {
    padding: 0 0 16px;
  }

  .breakdown-toolbar {
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    gap: 12px;
    padding: 12px 16px 0;
  }

  .breakdown-by-label {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .toolbar-label {
    font-size: 12px;
    font-weight: 500;
    color: var(--color-text-2);
  }

  .breakdown-labels-grid,
  .breakdown-values-grid {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: var(--gpt-gap-md);
    padding: 12px 16px 0;

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
