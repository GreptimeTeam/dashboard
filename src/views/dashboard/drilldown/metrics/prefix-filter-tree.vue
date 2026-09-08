<template lang="pug">
.prefix-filter-tree
  .prefix-filter-header(v-if="groups.length")
    span.prefix-filter-count {{ t('drilldown.sidebar.prefixSelected', { count: selected.length }) }}
    a-button(
      type="text"
      size="mini"
      :disabled="!selected.length"
      @click="clearSelection"
    ) {{ t('drilldown.sidebar.prefixClear') }}

  a-empty(v-if="!groups.length" size="small" :description="t('drilldown.sidebar.prefixEmpty')")

  ul.prefix-filter-list(v-else)
    li.prefix-filter-parent(v-for="group in groups" :key="group.value")
      .prefix-filter-row.prefix-filter-row--parent
        button.expand-btn(
          type="button"
          :aria-expanded="isExpanded(group.value)"
          :aria-label="isExpanded(group.value) ? t('drilldown.sidebar.prefixCollapse') : t('drilldown.sidebar.prefixExpand')"
          @click="toggleExpand(group.value)"
        )
          icon-down(v-if="isExpanded(group.value)")
          icon-right(v-else)
        a-checkbox(
          :model-value="isParentChecked(group.value)"
          @change="(checked: boolean) => onParentChange(group, checked)"
        )
          span.prefix-filter-label {{ group.label }}
          span.prefix-filter-count-badge ({{ group.count }})

      ul.prefix-filter-children(v-if="isExpanded(group.value) && getChildren(group.value).length")
        li.prefix-filter-child(v-for="child in getChildren(group.value)" :key="child.value")
          .prefix-filter-row.prefix-filter-row--child
            a-checkbox(
              :model-value="isChildChecked(child.value)"
              @change="(checked: boolean) => onChildChange(group, child, checked)"
            )
              span.prefix-filter-label {{ child.label }}
              span.prefix-filter-count-badge ({{ child.count }})
</template>

<script setup lang="ts">
  import { computed, ref, toValue, watch } from 'vue'
  import { useI18n } from 'vue-i18n'
  import IconDown from '@arco-design/web-vue/es/icon/icon-down'
  import IconRight from '@arco-design/web-vue/es/icon/icon-right'
  import {
    computeMetricPrefixSecondLevel,
    HIERARCHICAL_SEPARATOR,
    type PrefixChildGroup,
    type PrefixGroup,
  } from '@/observability/metrics/prefix-tree'

  const props = withDefaults(
    defineProps<{
      groups?: PrefixGroup[]
      metricNames?: string[]
      selectedPrefixes?: string[]
    }>(),
    {
      groups: () => [],
      metricNames: () => [],
      selectedPrefixes: () => [],
    }
  )

  const emit = defineEmits<{
    (e: 'update:selectedPrefixes', value: string[]): void
  }>()

  const { t } = useI18n()
  const expandedPrefixes = ref<Set<string>>(new Set())
  const computedSublevels = ref<Map<string, PrefixChildGroup[]>>(new Map())

  const asStringArray = (value: unknown): string[] => {
    const resolved = toValue(value)
    return Array.isArray(resolved) ? resolved.map(String) : []
  }

  const asPrefixGroupArray = (value: unknown): PrefixGroup[] => {
    const resolved = toValue(value)
    return Array.isArray(resolved) ? resolved : []
  }

  const groups = computed(() => asPrefixGroupArray(props.groups))
  const metricNames = computed(() => asStringArray(props.metricNames))
  const selected = computed(() => asStringArray(props.selectedPrefixes))

  const updateSelection = (next: string[]) => {
    emit('update:selectedPrefixes', next)
  }

  const isExpanded = (prefix: string) => expandedPrefixes.value.has(prefix)

  const getChildren = (parentValue: string) => computedSublevels.value.get(parentValue) ?? []

  const isParentChecked = (parentValue: string) =>
    selected.value.some((value) => value === parentValue || value.startsWith(`${parentValue}${HIERARCHICAL_SEPARATOR}`))

  const isChildChecked = (childValue: string) => selected.value.includes(childValue)

  const ensureSublevels = (parentValue: string) => {
    if (computedSublevels.value.has(parentValue)) {
      return
    }
    const next = new Map(computedSublevels.value)
    next.set(parentValue, computeMetricPrefixSecondLevel(metricNames.value, parentValue))
    computedSublevels.value = next
  }

  const toggleExpand = (parentValue: string) => {
    const next = new Set(expandedPrefixes.value)
    if (next.has(parentValue)) {
      next.delete(parentValue)
    } else {
      next.add(parentValue)
      ensureSublevels(parentValue)
    }
    expandedPrefixes.value = next
  }

  const onParentChange = (parent: PrefixGroup, checked: boolean) => {
    if (checked) {
      updateSelection([
        ...selected.value.filter((value) => !value.startsWith(`${parent.value}${HIERARCHICAL_SEPARATOR}`)),
        parent.value,
      ])
      return
    }
    updateSelection(
      selected.value.filter(
        (value) => value !== parent.value && !value.startsWith(`${parent.value}${HIERARCHICAL_SEPARATOR}`)
      )
    )
  }

  const onChildChange = (parent: PrefixGroup, child: PrefixChildGroup, checked: boolean) => {
    if (checked) {
      updateSelection([...selected.value.filter((value) => value !== parent.value), child.value])
      return
    }

    const siblings = selected.value.filter(
      (value) => value.startsWith(`${parent.value}${HIERARCHICAL_SEPARATOR}`) && value !== child.value
    )
    if (!siblings.length) {
      updateSelection([
        ...selected.value.filter((value) => !value.startsWith(`${parent.value}${HIERARCHICAL_SEPARATOR}`)),
        parent.value,
      ])
      return
    }
    updateSelection(selected.value.filter((value) => value !== child.value))
  }

  const clearSelection = () => {
    updateSelection([])
  }

  watch(
    metricNames,
    () => {
      computedSublevels.value = new Map()
    },
    { deep: true }
  )
</script>

<style scoped lang="less">
  .prefix-filter-tree {
    display: flex;
    flex: 1;
    flex-direction: column;
    min-height: 0;
    overflow: auto;
  }

  .prefix-filter-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 8px;
    font-size: 12px;
    color: var(--color-text-3);
  }

  .prefix-filter-list,
  .prefix-filter-children {
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .prefix-filter-row {
    display: flex;
    align-items: center;
    gap: 4px;
    min-height: 28px;

    &--child {
      padding-left: 28px;
    }
  }

  .expand-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 20px;
    height: 20px;
    padding: 0;
    border: none;
    background: transparent;
    color: var(--color-text-2);
    cursor: pointer;

    &:hover {
      color: var(--color-text-1);
    }
  }

  .prefix-filter-label {
    margin-right: 4px;
  }

  .prefix-filter-count-badge {
    color: var(--color-text-3);
    font-size: 12px;
  }
</style>
