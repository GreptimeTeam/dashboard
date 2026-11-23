<template lang="pug">
.column-layout-panel
  a-space(direction="vertical" size="small" fill)
    a-space
      a-button(type="text" size="small" @click="selectAll") Select All
      a-button(type="text" size="small" @click="deselectAll") Deselect All
    .column-layout-panel__list(ref="listEl")
      .column-layout-panel__row(v-for="name in listNames" :key="name" :data-name="name")
        span.column-layout-panel__handle(aria-hidden="true")
          icon-drag-dot-vertical
        a-checkbox(
          :model-value="visibleSet.has(name)"
          @update:model-value="(checked) => onToggle(name, Boolean(checked))"
        )
          | {{ name }}
</template>

<script setup lang="ts">
  import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
  import Sortable from 'sortablejs'
  import { IconDragDotVertical } from '@arco-design/web-vue/es/icon'
  import { panelColumnOrder } from '@/observability/table-column-layout'

  const props = withDefaults(
    defineProps<{
      /** All configurable column names for the current table (pinned excluded). */
      columnNames: string[]
      /** Currently visible names in display order. */
      visibleOrdered: string[]
    }>(),
    {
      columnNames: () => [],
      visibleOrdered: () => [],
    }
  )

  const emit = defineEmits<{
    (e: 'update:visibleOrdered', names: string[]): void
  }>()

  const listEl = ref<HTMLElement | null>(null)
  let sortable: Sortable | null = null

  const visibleSet = computed(() => new Set(props.visibleOrdered))

  const listNames = computed(() => panelColumnOrder(props.columnNames, props.visibleOrdered))

  function emitVisibleFromOrder(orderedNames: string[], visible: Set<string>) {
    emit(
      'update:visibleOrdered',
      orderedNames.filter((name) => visible.has(name))
    )
  }

  function onToggle(name: string, checked: boolean) {
    const next = new Set(visibleSet.value)
    if (checked) {
      next.add(name)
    } else {
      next.delete(name)
    }
    emitVisibleFromOrder(listNames.value, next)
  }

  function selectAll() {
    emit('update:visibleOrdered', props.columnNames.slice())
  }

  function deselectAll() {
    emit('update:visibleOrdered', [])
  }

  function readDomOrder(): string[] {
    if (!listEl.value) {
      return listNames.value
    }
    return Array.from(listEl.value.querySelectorAll<HTMLElement>('.column-layout-panel__row'))
      .map((row) => row.dataset.name || '')
      .filter(Boolean)
  }

  function bindSortable() {
    sortable?.destroy()
    sortable = null
    if (!listEl.value) {
      return
    }
    sortable = Sortable.create(listEl.value, {
      handle: '.column-layout-panel__handle',
      animation: 150,
      onEnd: () => {
        emitVisibleFromOrder(readDomOrder(), visibleSet.value)
      },
    })
  }

  onMounted(() => {
    bindSortable()
  })

  watch(
    () => props.columnNames.join('\0'),
    async () => {
      await nextTick()
      bindSortable()
    }
  )

  onBeforeUnmount(() => {
    sortable?.destroy()
    sortable = null
  })
</script>

<style lang="less" scoped>
  .column-layout-panel__list {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 160px;
  }

  .column-layout-panel__row {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 2px 0;
  }

  .column-layout-panel__handle {
    display: inline-flex;
    flex-shrink: 0;
    align-items: center;
    justify-content: center;
    width: 20px;
    height: 22px;
    margin-right: 2px;
    border-radius: var(--gpt-radius-sm);
    color: var(--gpt-text-secondary);
    font-size: 16px;
    cursor: grab;

    :deep(svg) {
      width: 1em;
      height: 1em;
    }

    &:hover {
      background: var(--gpt-nav-active-bg);
      color: var(--gpt-control-accent);
    }

    &:active {
      cursor: grabbing;
      color: var(--gpt-control-accent-hover);
    }
  }
</style>
