<template lang="pug">
.labels-tab(ref="paneScrollRoot")
  a-tabs.labels-panel-tabs.panel-tabs(
    type="line"
    lazy-load
    :editable="hasOpenLabels"
    :class="{ 'is-empty': !hasOpenLabels }"
    :animation="true"
    :hide-content="!hasOpenLabels"
    :active-key="activeTabKey"
    @change="onActiveChange"
    @delete="onDeleteLabel"
  )
    template(#extra)
      a-dropdown(
        trigger="click"
        position="br"
        :popup-max-height="280"
        :disabled="!canAddLabel"
      )
        a-button(
          type="text"
          size="small"
          :disabled="!canAddLabel"
          :loading="loadingKeys"
        )
          span {{ addLabelText }}
          icon-down.add-label-caret
        template(#content)
          a-doption(v-for="key in availableKeys" :key="key" @click="addLabel(key)") {{ key }}

    a-tab-pane(
      v-for="label in openLabelList"
      :key="label"
      closable
      :title="label"
    )
      .label-pane
        a-spin.label-pane-spin(:loading="isLabelLoading(label)")
          template(v-if="!isLabelLoading(label)")
            a-empty(v-if="!hasValues(label)" :description="t('drilldown.logs.noLabelValues')")
            .value-panels(v-else)
              LabelValuePanel(
                v-for="(row, index) in valuesFor(label)"
                :key="`${label}:${row.value}`"
                :label-col="label"
                :label-value="String(row.value)"
                :log-count="Number(row.count) || 0"
                :color-index="index"
                :scroll-root="paneScrollRoot"
              )

  .labels-empty(v-if="!hasOpenLabels")
    a-empty(:description="t('drilldown.logs.pickLabelHint')")
</template>

<script setup lang="ts">
  import { computed, onMounted, reactive, ref, watch } from 'vue'
  import { useI18n } from 'vue-i18n'
  import { IconDown } from '@arco-design/web-vue/es/icon'
  import { useDrilldownContext } from '@/observability/context'
  import { fetchLabelValues, listLabelKeys, type LabelValueRow } from '@/observability/adapters/logs'
  import LabelValuePanel from './label-value-panel.vue'

  const props = withDefaults(
    defineProps<{
      autoOpenDefault?: boolean
    }>(),
    { autoOpenDefault: false }
  )

  const { t } = useI18n()
  const ctx = useDrilldownContext()
  const paneScrollRoot = ref<HTMLElement | null>(null)

  const loadingKeys = ref(false)
  const labelKeys = ref<string[]>([])
  const openLabels = ref<string[]>([])
  const activeLabel = ref<string | undefined>()
  const valuesByLabel = reactive<Record<string, LabelValueRow[]>>({})
  const loadingValues = reactive<Record<string, boolean>>({})

  const addLabelText = computed(() => t('drilldown.logs.addLabel'))
  const availableKeys = computed(() => {
    const open = openLabels.value ?? []
    return (labelKeys.value ?? []).filter((key) => !open.includes(key))
  })
  const openLabelList = computed(() => openLabels.value ?? [])
  const canAddLabel = computed(() => availableKeys.value.length > 0)
  const hasOpenLabels = computed(() => openLabelList.value.length > 0)
  const activeTabKey = computed(() => {
    if (activeLabel.value && openLabelList.value.includes(activeLabel.value)) {
      return activeLabel.value
    }
    return openLabelList.value[0]
  })

  function valuesFor(label: string): LabelValueRow[] {
    const rows = valuesByLabel[label]
    return Array.isArray(rows) ? rows : []
  }

  function hasValues(label: string) {
    return valuesFor(label).length > 0
  }

  function isLabelLoading(label: string) {
    return Boolean(loadingValues[label])
  }

  function clearOpenLabelState() {
    openLabels.value = []
    activeLabel.value = undefined
    Object.keys(valuesByLabel).forEach((key) => {
      delete valuesByLabel[key]
    })
    Object.keys(loadingValues).forEach((key) => {
      delete loadingValues[key]
    })
  }

  async function loadValuesFor(label: string) {
    if (!label) return
    // Drop stale in-flight queries after table switch (openLabels already cleared).
    if (!openLabelList.value.includes(label) && !labelKeys.value.includes(label)) {
      return
    }
    loadingValues[label] = true
    try {
      valuesByLabel[label] = (await fetchLabelValues(ctx, label)) ?? []
    } finally {
      loadingValues[label] = false
    }
  }

  function pickDefaultLabel(keys: string[]) {
    const primary = ctx.fieldMap.value.logs.primaryGroupBy
    if (primary && keys.includes(primary)) return primary
    const { service } = ctx.fieldMap.value.logs
    if (service && keys.includes(service)) return service
    return keys[0]
  }

  function ensureDefaultLabel() {
    if (!props.autoOpenDefault || openLabelList.value.length > 0 || labelKeys.value.length === 0) {
      return
    }
    const next = pickDefaultLabel(labelKeys.value)
    if (!next) return
    openLabels.value = [next]
    activeLabel.value = next
    loadValuesFor(next)
  }

  async function loadKeys() {
    loadingKeys.value = true
    try {
      const keys = await listLabelKeys(ctx)
      labelKeys.value = Array.isArray(keys) ? keys : []
      openLabels.value = openLabelList.value.filter((key) => labelKeys.value.includes(key))
      Object.keys(valuesByLabel).forEach((key) => {
        if (!openLabels.value.includes(key)) {
          delete valuesByLabel[key]
          delete loadingValues[key]
        }
      })
      if (activeLabel.value && !openLabels.value.includes(activeLabel.value)) {
        activeLabel.value = openLabels.value[0]
      }
      ensureDefaultLabel()
    } finally {
      loadingKeys.value = false
    }
  }

  function addLabel(key: string) {
    if (!key || openLabelList.value.includes(key)) return
    openLabels.value = [...openLabelList.value, key]
    activeLabel.value = key
    loadValuesFor(key)
  }

  function onActiveChange(key: string | number) {
    const label = String(key ?? '')
    if (!label || !openLabelList.value.includes(label)) return
    activeLabel.value = label
    loadValuesFor(label)
  }

  function onDeleteLabel(key: string | number) {
    const label = String(key ?? '')
    if (!label) return
    openLabels.value = openLabelList.value.filter((item) => item !== label)
    delete valuesByLabel[label]
    delete loadingValues[label]
    if (activeLabel.value === label) {
      activeLabel.value = openLabels.value[0]
      if (activeLabel.value) loadValuesFor(activeLabel.value)
    }
  }

  onMounted(() => {
    loadKeys()
  })

  // Drop old label panes synchronously before refreshKey watchers fire SQL with stale cols.
  watch(
    () => ctx.logsTable.value,
    (table, prev) => {
      if (table === prev) return
      clearOpenLabelState()
      labelKeys.value = []
    },
    { flush: 'sync' }
  )

  watch(
    () => [ctx.logsTable.value, ctx.refreshKey.value] as const,
    async () => {
      await loadKeys()
      await Promise.all(openLabelList.value.map((label) => loadValuesFor(label)))
    }
  )

  watch(
    () => [ctx.time.value, ctx.rangeTime.value[0], ctx.rangeTime.value[1], ctx.filters.value],
    () => {
      openLabelList.value.forEach((label) => loadValuesFor(label))
    },
    { deep: true }
  )
</script>

<style scoped lang="less">
  .labels-tab {
    display: flex;
    flex: 1 1 auto;
    flex-direction: column;
    min-height: 0;
    overflow: hidden;
  }

  .labels-panel-tabs {
    flex: 1 1 auto;
    min-height: 0;
  }

  .labels-panel-tabs.is-empty {
    flex: 0 0 auto;
    height: auto;

    :deep(.arco-tabs-content) {
      display: none;
      height: 0;
    }
  }

  .labels-panel-tabs :deep(.arco-tabs-nav-tab) {
    /* Default flex:1 pushes #extra to the far right — keep Add label next to tabs. */
    flex: 0 1 auto;
    max-width: calc(100% - 140px);
  }

  .labels-panel-tabs :deep(.arco-tabs-nav-extra) {
    display: flex;
    flex-shrink: 0;
    align-items: center;
    margin-left: 8px;
    margin-right: 12px;
  }

  .add-label-caret {
    margin-left: 4px;
  }

  .labels-empty {
    display: flex;
    flex: 1 1 auto;
    align-items: center;
    justify-content: center;
    min-height: 160px;
    padding: 24px;
  }

  .labels-panel-tabs :deep(.arco-tabs-content) {
    padding: 0;
  }

  .label-pane {
    height: 100%;
    min-height: 0;
    overflow: auto;
    padding: 0;
  }

  .label-pane-spin {
    display: block;
    min-height: 120px;
  }

  .value-panels {
    display: flex;
    flex-direction: column;
    gap: 0;
  }
</style>
