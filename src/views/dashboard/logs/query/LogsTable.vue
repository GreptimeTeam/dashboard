<template lang="pug">
#log-table-container(ref="tableContainer" :class="{ 'hide-table-header': !showHeader }")
  DataTable(
    :data="data"
    :columns="columns"
    :column-mode="columnMode"
    :displayed-columns="displayedColumns"
    :loading="loading"
    :size="size"
    :wrap-line="wrapLine"
    :virtual-list-props="virtualListPropsBinding"
    :column-resizable="columnMode === 'separate' && virtual"
    :row-selection="activeRowSelection"
    :selected-keys="exportSelectedKeys"
    :ts-column="tsColumn"
    :ts-cell-detail="tsCellDetail"
    :active-row-key="detailVisible ? selectedRowKey : null"
    :show-context-menu="sqlMode === 'builder'"
    :show-header="arcoShowHeader"
    :allow-virtual-h-scroll="allowMergedVirtualHScroll"
    :class="dataTableClass"
    @filter-condition-add="handleFilterConditionAdd"
    @row-select="$emit('rowSelect', $event)"
    @ts-cell-click="handleTsClick"
    @update:selected-keys="handleSelectedKeysUpdate"
    @virtualColumnsClipped="(visible) => $emit('virtualColumnsClipped', visible)"
  )
    template(v-if="$slots['column-level']" #column-level="slotProps")
      slot(name="column-level" v-bind="slotProps")

  LogDetail(
    v-model:visible="detailVisible"
    :selected-row-key="selectedRowKey"
    :curr-row="selectedRecord"
    :rows="data"
    :columns="columns"
    @update:selected-row-key="selectedRowKey = $event"
  )
</template>

<script setup lang="ts" name="LogTableData">
  import { ref, computed, watch, nextTick, onMounted, onBeforeUnmount } from 'vue'
  import { useElementSize } from '@vueuse/core'
  import type { ColumnType, TSColumn } from '@/types/query'
  import LogDetail from './LogDetail.vue'

  interface TableData {
    [key: string]: any
  }

  const props = withDefaults(
    defineProps<{
      wrapLine: boolean
      size: 'small' | 'mini' | 'medium' | 'large'
      data: TableData[]
      columns: ColumnType[]
      sqlMode: string
      tsColumn: TSColumn | null
      columnMode: 'separate' | 'merged' | 'merged-with-keys'
      displayedColumns: string[]
      loading?: boolean
      exportRowSelection?: Record<string, unknown>
      selectedKeys?: number[]
      virtual?: boolean
      showHeader?: boolean
      allowMergedVirtualHScroll?: boolean
    }>(),
    {
      wrapLine: false,
      size: 'medium',
      data: () => [],
      columns: () => [],
      sqlMode: 'editor',
      tsColumn: null,
      columnMode: 'separate',
      displayedColumns: () => [],
      loading: false,
      exportRowSelection: undefined,
      selectedKeys: () => [],
      virtual: true,
      showHeader: true,
      allowMergedVirtualHScroll: false,
    }
  )

  const emit = defineEmits([
    'filterConditionAdd',
    'rowSelect',
    'updateSelectedKeys',
    'virtualColumnsClipped',
    'reachEnd',
  ])

  const selectedRowKey = ref<number | null>(null)
  const selectedRecord = computed(() => props.data[selectedRowKey.value])

  const tableContainer = ref<HTMLElement | null>(null)
  const { height } = useElementSize(tableContainer)

  const detailRowSelection = ref({
    type: 'radio' as const,
    checkStrictly: false,
    selectedRowKeys: computed(() => [selectedRowKey.value]),
  })

  const activeRowSelection = computed(() => props.exportRowSelection ?? detailRowSelection.value)
  const tsCellDetail = computed(() => !!props.tsColumn && !props.exportRowSelection)
  const exportSelectedKeys = computed(() => (props.exportRowSelection ? props.selectedKeys : undefined))
  const detailVisible = ref(false)

  /**
   * Arco virtual body widths come from measuring header <th>.
   * Keep header mounted in virtual mode; clip when UI wants no header.
   */
  const arcoShowHeader = computed(() => props.showHeader || props.virtual)

  const dataTableClass = computed(() => ({
    'builder_type': props.sqlMode === 'builder',
    'logs-table--headerless': !props.showHeader,
  }))

  const headerHeight = computed(() => (props.size === 'mini' ? 25 : 38))

  const virtualListHeight = computed(() => {
    const containerHeight = height.value
    const header = props.showHeader ? headerHeight.value : 0
    return Math.max(0, containerHeight - header)
  })

  let reachEndArmed = true

  function emitReachEnd() {
    if (!reachEndArmed) {
      return
    }
    reachEndArmed = false
    emit('reachEnd')
  }

  function checkReachEnd(el: HTMLElement) {
    const remaining = el.scrollHeight - el.scrollTop - el.clientHeight
    if (remaining <= 64) {
      emitReachEnd()
    } else if (remaining > 120) {
      reachEndArmed = true
    }
  }

  function isScrollableLogsSurface(el: EventTarget | null): el is HTMLElement {
    if (!(el instanceof HTMLElement)) {
      return false
    }
    return (
      el.classList.contains('arco-virtual-list') ||
      el.classList.contains('sticky-scroll') ||
      (el.classList.contains('arco-table-body') && el.scrollHeight > el.clientHeight + 1)
    )
  }

  /** Capture on stable container — survives Arco virtual-list remounts (tableRenderKey). */
  function onScrollCapture(event: Event) {
    if (!isScrollableLogsSurface(event.target)) {
      return
    }
    checkReachEnd(event.target)
  }

  function checkCurrentScrollRoot() {
    const root = tableContainer.value
    if (!root) {
      return
    }
    const el =
      root.querySelector('.arco-virtual-list') ||
      root.querySelector('.sticky-scroll') ||
      root.querySelector('.arco-table-body')
    if (el instanceof HTMLElement) {
      checkReachEnd(el)
    }
  }

  const virtualListPropsBinding = computed(() => {
    if (!props.virtual || virtualListHeight.value <= 0) {
      return undefined
    }
    return {
      height: virtualListHeight.value,
      buffer: 36,
      onReachBottom: () => {
        emitReachEnd()
      },
    }
  })

  const handleTsClick = (row: TableData, rowIndex: number) => {
    if (props.exportRowSelection) return
    selectedRowKey.value = rowIndex
    emit('rowSelect', row)
    detailVisible.value = true
  }

  const handleFilterConditionAdd = (event) => {
    emit('filterConditionAdd', event)
  }

  const handleSelectedKeysUpdate = (keys: number[]) => {
    if (props.exportRowSelection) {
      emit('updateSelectedKeys', keys)
    }
  }

  onMounted(() => {
    tableContainer.value?.addEventListener('scroll', onScrollCapture, { passive: true, capture: true })
    nextTick(() => checkCurrentScrollRoot())
  })

  onBeforeUnmount(() => {
    tableContainer.value?.removeEventListener('scroll', onScrollCapture, true)
  })

  // Re-arm + re-check after append (content may still not fill the viewport).
  watch(
    () => props.data.length,
    () => {
      reachEndArmed = true
      nextTick(() => checkCurrentScrollRoot())
    }
  )

  watch(
    () => [height.value, virtualListHeight.value],
    () => {
      reachEndArmed = true
      nextTick(() => checkCurrentScrollRoot())
    }
  )
</script>

<style lang="less" scoped>
  #log-table-container {
    height: 100%;
    display: flex;
    flex-direction: column;

    :deep(.data-table-container) {
      height: 100%;
      flex: 1;
    }
  }

  // Keep Arco header in DOM (thWidth → body widths) but fully collapse visually.
  #log-table-container.hide-table-header {
    position: relative;

    :deep(.arco-table-header) {
      position: absolute !important;
      top: 0;
      left: 0;
      z-index: -1;
      width: 100%;
      height: 0 !important;
      max-height: 0 !important;
      margin: 0 !important;
      padding: 0 !important;
      overflow: hidden !important;
      border: none !important;
      opacity: 0 !important;
      visibility: hidden !important;
      pointer-events: none !important;
    }

    :deep(.arco-table-header .arco-table-tr),
    :deep(.arco-table-header .arco-table-th),
    :deep(.arco-table-header .arco-table-cell) {
      height: 0 !important;
      max-height: 0 !important;
      margin: 0 !important;
      padding: 0 !important;
      border: none !important;
      line-height: 0 !important;
      font-size: 0 !important;
      overflow: hidden !important;
    }

    :deep(.arco-virtual-list .arco-table-td.cell-edge-left) {
      width: 200px !important;
      min-width: 200px !important;
      max-width: 200px !important;
      box-sizing: border-box;
    }
  }
</style>
