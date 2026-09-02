<template lang="pug">
.breakdown-grid
  a-spin(style="width: 100%" :loading="loading")
    template(v-if="selectedLabel")
      .breakdown-values-header
        a-button(type="text" size="small" @click="selectedLabel = undefined")
          | {{ t('drilldown.breakdown.backToLabels') }}
        span {{ selectedLabel }}
      .breakdown-values-grid
        BreakdownValueCard(
          v-for="value in selectedValues"
          :key="value"
          :label-key="selectedLabel"
          :value="value"
        )
      a-empty(v-if="!selectedValues.length" :description="t('drilldown.breakdown.noValues')")
    template(v-else)
      .breakdown-labels-grid
        BreakdownLabelCard(
          v-for="labelKey in labelKeys"
          :key="labelKey"
          :metric="metric"
          :label-key="labelKey"
          @select="openLabel(labelKey)"
        )
      a-empty(v-if="!labelKeys.length && !loading" :description="t('drilldown.breakdown.noLabels')")
</template>

<script setup lang="ts">
  import { onMounted, ref, watch } from 'vue'
  import { useI18n } from 'vue-i18n'
  import { useDrilldownContext } from '@/observability/context'
  import { fetchBreakdownLabelKeys, fetchBreakdownLabelValues } from '@/observability/metrics/breakdown'
  import BreakdownLabelCard from './breakdown-label-card.vue'
  import BreakdownValueCard from './breakdown-value-card.vue'

  const props = defineProps<{
    metric: string
  }>()

  const { t } = useI18n()
  const ctx = useDrilldownContext()

  const loading = ref(false)
  const labelKeys = ref<string[]>([])
  const selectedLabel = ref<string | undefined>()
  const selectedValues = ref<string[]>([])

  const loadLabels = async () => {
    loading.value = true
    try {
      labelKeys.value = await fetchBreakdownLabelKeys(ctx, props.metric)
    } finally {
      loading.value = false
    }
  }

  const openLabel = async (labelKey: string) => {
    selectedLabel.value = labelKey
    loading.value = true
    try {
      selectedValues.value = await fetchBreakdownLabelValues(ctx, props.metric, labelKey)
    } finally {
      loading.value = false
    }
  }

  onMounted(() => {
    loadLabels()
  })

  watch(
    () => [ctx.filters.value, ctx.time.value, ctx.rangeTime.value[0], ctx.rangeTime.value[1], ctx.refreshKey.value],
    () => {
      selectedLabel.value = undefined
      selectedValues.value = []
      loadLabels()
    },
    { deep: true }
  )
</script>

<style scoped lang="less">
  .breakdown-grid {
    padding: 12px 0;
  }

  .breakdown-labels-grid,
  .breakdown-values-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
    gap: 12px;
  }

  .breakdown-values-header {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-bottom: 12px;
    font-size: 13px;
    font-weight: 600;
  }
</style>
