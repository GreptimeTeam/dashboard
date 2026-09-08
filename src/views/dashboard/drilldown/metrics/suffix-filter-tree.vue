<template lang="pug">
.suffix-filter-list
  .suffix-filter-header(v-if="groups.length")
    span.suffix-filter-count {{ t('drilldown.sidebar.suffixSelected', { count: selected.length }) }}
    a-button(
      type="text"
      size="mini"
      :disabled="!selected.length"
      @click="clearSelection"
    ) {{ t('drilldown.sidebar.suffixClear') }}

  a-empty(v-if="!groups.length" size="small" :description="t('drilldown.sidebar.suffixEmpty')")

  ul.suffix-filter-options(v-else)
    li.suffix-filter-option(v-for="group in groups" :key="group.value")
      a-checkbox(
        :model-value="selected.includes(group.value)"
        @change="(checked: boolean) => onChange(group.value, checked)"
      )
        span.suffix-filter-label {{ group.label }}
        span.suffix-filter-count-badge ({{ group.count }})
</template>

<script setup lang="ts">
  import { computed, toValue } from 'vue'
  import { useI18n } from 'vue-i18n'
  import type { SuffixGroup } from '@/observability/metrics/suffix-tree'

  const props = withDefaults(
    defineProps<{
      groups?: SuffixGroup[]
      selectedSuffixes?: string[]
    }>(),
    {
      groups: () => [],
      selectedSuffixes: () => [],
    }
  )

  const emit = defineEmits<{
    (e: 'update:selectedSuffixes', value: string[]): void
  }>()

  const { t } = useI18n()

  const asStringArray = (value: unknown): string[] => {
    const resolved = toValue(value)
    return Array.isArray(resolved) ? resolved.map(String) : []
  }

  const asSuffixGroupArray = (value: unknown): SuffixGroup[] => {
    const resolved = toValue(value)
    return Array.isArray(resolved) ? resolved : []
  }

  const groups = computed(() => asSuffixGroupArray(props.groups))
  const selected = computed(() => asStringArray(props.selectedSuffixes))

  const updateSelection = (next: string[]) => {
    emit('update:selectedSuffixes', next)
  }

  const onChange = (value: string, checked: boolean) => {
    if (checked) {
      updateSelection([...selected.value, value])
      return
    }
    updateSelection(selected.value.filter((item) => item !== value))
  }

  const clearSelection = () => {
    updateSelection([])
  }
</script>

<style scoped lang="less">
  .suffix-filter-list {
    display: flex;
    flex: 1;
    flex-direction: column;
    min-height: 0;
    overflow: auto;
  }

  .suffix-filter-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 8px;
    font-size: 12px;
    color: var(--color-text-3);
  }

  .suffix-filter-options {
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .suffix-filter-option {
    min-height: 28px;
    display: flex;
    align-items: center;
  }

  .suffix-filter-label {
    margin-right: 4px;
  }

  .suffix-filter-count-badge {
    color: var(--color-text-3);
    font-size: 12px;
  }
</style>
