<template lang="pug">
.timeline-header(style="display: flex; align-items: stretch")
  a-split(v-model:size="spanInfoWidth" :min="200" :max="1000")
    template(#first)
      .span-name Operation Name
    template(#second)
      .time-ticks
        .tick(v-for="(tick, index) in 4" :key="index")
          .tick-label {{ formatTickTime(index) }}
          .tick-label(v-if="index === 3" style="text-align: right") {{ formatDuration(rootSpan?.duration_nano || 0) }}
    template(#resize-trigger)
      .resize-trigger(
        style="width: 1px; height: calc(100vh - 150px); background-color: var(--color-border); position: absolute; cursor: col-resize; z-index: 1000"
      )
        icon-drag-dot-vertical(
          style="position: absolute; left: -8px; top: 50%; transform: translateY(-50%); color: var(--color-text-3)"
        )
a-spin.spin-block(:loading="loading")
  .tree-container
    a-tree(
      :key="spanTree.length ? spanTree[0].span_id : ''"
      ref="treeRef"
      blockNode
      default-expand-all
      :data="spanTree"
      @select="handleSpanSelect"
    )
      template(#title="data")
        .span-item
          .span-info(:style="getSpanInfoStyle(data._level)")
            span.span-name {{ data.span_name }}
            a-tag(size="small") {{ data.service_name }}
          .span-timeline
            .time-bar-container
              .time-bar(
                :style=`{
                  left: getRelativePosition(data, rootSpan?.timestamp || 0, (rootSpan?.timestamp || 0) + (rootSpan?.duration_nano || 0)) + '%',
                  width: getDurationWidth(data, rootSpan?.timestamp || 0, (rootSpan?.timestamp || 0) + (rootSpan?.duration_nano || 0)) + '%',
                  backgroundColor: data.status === 'error' ? 'var(--color-danger-light-1)' : getServiceColor(data.service_name)
                }`
                :class="{ error: data.status === 'error' }"
              )
                .time-info
                  span.span-duration {{ formatDuration(data.duration_nano) }}
</template>

<script setup lang="ts">
  import { ref, computed } from 'vue'
  import type { PropType } from 'vue'
  import type { TreeNodeData } from '@arco-design/web-vue'
  import { IconDragDotVertical } from '@arco-design/web-vue/es/icon'
  import type { Span } from '../utils'
  import { formatDuration, getRelativePosition, getDurationWidth } from '../utils'

  const props = defineProps({
    loading: {
      type: Boolean,
      default: false,
    },
    spanTree: {
      type: Array as PropType<Span[]>,
      required: true,
    },
    rootSpan: {
      type: Object as PropType<Span | null>,
      default: null,
    },
  })

  const emit = defineEmits(['spanSelect'])

  const treeRef = ref()
  const spanInfoWidth = ref('300px')

  // Predefined color palette for service names
  const serviceColors = [
    '#7B9BFF', // Muted blue
    '#52C41A', // Muted green
    '#FA8C16', // Muted orange
    '#597EF7', // Muted indigo (replacing red)
    '#9254DE', // Muted purple
    '#36CFC9', // Muted teal
    '#D4B106', // Muted gold (replacing pink)
    '#FADB14', // Muted yellow
    '#8C8C8C', // Muted gray
    '#40A9FF', // Muted light blue
    '#95DE64', // Muted light green
    '#FFC069', // Muted light orange
  ]

  function getServiceColor(serviceName: string): string {
    if (!serviceName) return serviceColors[0]

    // Create a simple hash from service name to consistently assign colors
    let hash = 0
    for (let i = 0; i < serviceName.length; i += 1) {
      const char = serviceName.charCodeAt(i)
      hash = (hash * 31 + char) % Number.MAX_SAFE_INTEGER
    }

    const colorIndex = Math.abs(hash) % serviceColors.length
    return serviceColors[colorIndex]
  }

  function formatTickTime(index: number): string {
    if (!props.rootSpan) return ''
    const duration = props.rootSpan.duration_nano
    const tickTime = (duration * index) / 4
    return formatDuration(tickTime)
  }

  function handleSpanSelect(
    selectedKeys: (string | number)[],
    data: { selected?: boolean; selectedNodes: TreeNodeData[]; node?: TreeNodeData; e?: Event }
  ) {
    if (data.node) {
      emit('spanSelect', data.node.key, data.node)
    }
  }

  function getSpanInfoStyle(level: number) {
    return {
      width: `calc(${spanInfoWidth.value} - 36px - ${level * 22}px)`,
    }
  }
</script>

<style lang="less" scoped>
  .timeline-header {
    padding: 0;
    border: 1px solid var(--color-border);
    margin-bottom: 8px;
    font-weight: 500;
    color: var(--color-text-2);
    background-color: var(--color-fill-2);
    display: flex;
    align-items: stretch;

    .span-name {
      display: flex;
      align-items: center;
      gap: 8px;
      flex-shrink: 0;
      padding: 8px 8px;
      height: 100%;
    }
  }

  :deep(.arco-split) {
    width: 100%;
    height: 100%;
    user-select: none;
  }

  .time-ticks {
    pointer-events: none;
    display: flex;
    align-items: stretch;
    justify-content: space-between;
    width: 100%;
    height: 100%;

    .tick {
      flex: 1;
      display: flex;
      justify-content: space-between;
      border-left: 1px solid var(--color-border);
      padding: 4px 4px;
      align-items: center;

      .tick-label {
        font-size: 12px;
        color: var(--color-text-3);
      }
    }
  }

  .tree-container {
    height: calc(100vh - 200px);
    overflow: auto;
    padding: 8px 0;
  }

  :deep(.arco-tree) {
    height: 100%;
  }

  .span-item {
    display: flex;
    align-items: center;
    gap: 16px;
    width: 100%;
    position: relative;

    .span-info {
      display: flex;
      align-items: center;
      gap: 8px;
      flex-shrink: 0;
    }

    .span-timeline {
      flex: 1;
      position: relative;
      height: 24px;
      border-radius: 4px;

      .time-bar-container {
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
      }

      .time-bar {
        position: absolute;
        height: 6px;
        top: 50%;
        transform: translateY(-50%);
        border-radius: 2px;
        transition: all 0.2s;

        .time-info {
          position: absolute;
          right: 0;
          top: -16px;
          white-space: nowrap;
          color: var(--color-text-3);
          font-size: 12px;
        }
      }
    }
  }

  :deep(.arco-tree-node) {
    padding: 0 0;
  }

  :deep(.arco-tree-node-content) {
    padding: 4px 8px;
    border-radius: 4px;
    transition: background-color 0.2s;

    &:hover {
      background-color: var(--color-fill-2);
    }
  }

  :deep(.arco-tree-node-title) {
    display: block;
    width: 100%;
  }

  .spin-block {
    display: block;
    width: 100%;
    height: 100%;
  }

  .resize-trigger {
    &:hover {
      background-color: var(--color-primary);

      :deep(.arco-icon) {
        color: var(--color-primary);
      }
    }
  }
</style>
