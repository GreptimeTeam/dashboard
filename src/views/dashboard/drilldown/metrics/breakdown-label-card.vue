<template lang="pug">
.breakdown-label-card
  .card-header
    span.card-title {{ labelKey }}
    a-space(size="small")
      a-button(
        v-if="singleValue"
        type="outline"
        size="mini"
        @click="addSingleValueToFilter"
      )
        | {{ t('drilldown.filters.addToFilter') }}
      a-button(
        v-else-if="values.length > 1"
        type="outline"
        size="mini"
        @click="$emit('select')"
      )
        | {{ t('drilldown.breakdown.selectLabel') }}
  .card-body
    span.card-meta {{ values.length }} {{ t('drilldown.breakdown.values') }}
</template>

<script setup lang="ts">
  import { computed, onMounted, ref } from 'vue'
  import { useI18n } from 'vue-i18n'
  import { useDrilldownContext } from '@/observability/context'
  import { fetchBreakdownLabelValues } from '@/observability/metrics/breakdown'

  const props = defineProps<{
    metric: string
    labelKey: string
  }>()

  defineEmits<{
    (e: 'select'): void
  }>()

  const { t } = useI18n()
  const ctx = useDrilldownContext()
  const values = ref<string[]>([])
  const loading = ref(false)

  const singleValue = computed(() => values.value.length === 1)

  const loadValues = async () => {
    loading.value = true
    try {
      values.value = await fetchBreakdownLabelValues(ctx, props.metric, props.labelKey)
    } finally {
      loading.value = false
    }
  }

  const addSingleValueToFilter = () => {
    const value = values.value[0]
    if (!value || value === '<unspecified>') {
      return
    }
    ctx.appendFilter({ key: props.labelKey, op: '=', value })
  }

  onMounted(() => {
    loadValues()
  })
</script>

<style scoped lang="less">
  .breakdown-label-card {
    border: 1px solid var(--color-border-2);
    border-radius: 8px;
    padding: 12px;
    background: var(--color-bg-2);
  }

  .card-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    margin-bottom: 8px;
  }

  .card-title {
    font-size: 13px;
    font-weight: 600;
    color: var(--color-text-1);
  }

  .card-meta {
    font-size: 12px;
    color: var(--color-text-3);
  }
</style>
