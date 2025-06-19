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
      default-expand-all
      :data="spanTree"
      @select="handleSpanSelect"
    )
      template(#icon="{ node, expanded }")
        .expand-info(
          v-if="node.children && node.children.length > 0"
          :class="{ expanded: expanded }"
          :style="{ backgroundColor: getServiceColor(node.service_name) }"
          @click.stop="toggleExpand(node, expanded)"
        )
          .expand-icon
            icon-down(v-if="expanded")
            icon-right(v-else)
          .child-count {{ getChildCount(node, expanded) }}
        .leaf-node(v-else)
          .no-expand-icon(:style="{ backgroundColor: getServiceColor(node.service_name) }")
      template(#title="data")
        .span-item
          .span-info(:style="getSpanInfoStyle(data._level)")
            span.span-name {{ data.span_name }}
            a-tag(size="small") {{ data.service_name }}
          .span-timeline
            .time-bar-container
              .time-bar(
                :style=`{
                  left: getRelativePosition(data, rootTimeStamp, rootEndTimeStamp) + '%',
                  width: getDurationWidth(data, rootTimeStamp, rootEndTimeStamp) + '%',
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
  import { IconDragDotVertical, IconDown, IconRight } from '@arco-design/web-vue/es/icon'
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
  const spanInfoWidth = ref('400px')

  const rootTimeStamp = computed(() => props.rootSpan?.timestamp || 0)
  const rootEndTimeStamp = computed(() => {
    return (props.rootSpan?.timestamp || 0) + (props.rootSpan?.duration_nano || 0)
  })
  // Predefined color palette for service names - moderate saturation, avoiding red/orange/gray
  const serviceColors = [
    '#70A4BC', // Muted Sky Blue (Cool, Light Blue)
    '#8DB47A', // Soft Sage Green (Slightly Brighter Green)
    '#9985B1', // Dusty Lavender (Clearer Purple)
    '#6ABAA5', // Calm Teal (More Distinct Blue-Green)
    '#C7B47E', // Muted Gold / Ochre (Richer Yellow-Brown)
    '#5A8FC0', // Medium Muted Blue (More Vibrant Medium Blue)
    '#7C6091', // Muted Plum (Deeper, More Defined Purple)
    '#C0A890', // Light Warm Brown (A Distinct Earth Tone)
    '#BD8C91', // Muted Berry Pink (More Prominent Pink, still soft)
    '#3F6A90', // Deeper Ocean Blue (Solid, Darker Blue)
    '#A08C78', // Dark Muted Brown (Robust Earthy Brown)
    '#52805B', // Deep Forest Green (Solid, Dark Green)
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

  // Calculate direct children count
  function getDirectChildrenCount(node: TreeNodeData): number {
    return node.children ? node.children.length : 0
  }

  // Calculate total children count (including sub-children)
  function getTotalChildrenCount(node: TreeNodeData): number {
    if (!node.children || node.children.length === 0) {
      return 0
    }

    let total = node.children.length
    node.children.forEach((child) => {
      total += getTotalChildrenCount(child)
    })
    return total
  }

  // Get child count based on expanded state
  function getChildCount(node: TreeNodeData, expanded: boolean): number {
    if (!node.children || node.children.length === 0) {
      return 0
    }

    return expanded ? getDirectChildrenCount(node) : getTotalChildrenCount(node)
  }

  function handleSpanSelect(
    selectedKeys: (string | number)[],
    data: { selected?: boolean; selectedNodes: TreeNodeData[]; node?: TreeNodeData; e?: Event }
  ): void {
    if (data.node) {
      emit('spanSelect', data.node.key, data.node)
    }
  }

  function getSpanInfoStyle(level: number): { width: string } {
    return {
      width: `calc(${spanInfoWidth.value} - 52px - ${level * 22}px)`,
    }
  }

  function formatTickTime(index: number): string {
    if (!props.rootSpan) return ''
    const duration = props.rootSpan.duration_nano
    const tickTime = (duration * index) / 4
    return formatDuration(tickTime)
  }

  function toggleExpand(node: TreeNodeData, expanded: boolean): void {
    if (node.children && node.children.length > 0 && treeRef.value) {
      if (expanded) {
        // Collapse the tree node
        treeRef.value.expandNode(node.key, false)
      } else {
        // Expand the tree node
        treeRef.value.expandNode(node.key, true)
      }
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
    height: calc(100vh - 196px);
    overflow: auto;
    padding: 8px 0;
  }

  :deep(.arco-tree) {
    height: 100%;
  }

  // Hide default tree expand/collapse icons
  :deep(.arco-tree-node-switcher) {
    display: none !important;
  }
  :deep(.arco-tree-node-selected .arco-tree-node-title) {
    color: var(--color-primary);
    background-color: var(--color-fill-2);
  }
  .expand-info {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 2px 6px;
    border-radius: 4px;
    cursor: pointer;
    transition: all 0.2s;
    font-size: 11px;
    width: 32px;
    height: 28px;
    justify-content: center;

    &:hover {
      border-color: var(--color-primary);
      opacity: 0.8;
    }

    &.expanded {
      border-color: var(--color-primary);
      opacity: 0.9;
    }

    .expand-icon {
      display: flex;
      align-items: center;
      font-size: 10px;
      height: 22px;
    }

    .child-count {
      font-weight: bold;
      font-size: 10px;
    }
  }
  .leaf-node {
    width: 32px;
    height: 28px;
    display: flex;
    align-items: center;
    justify-content: flex-end;
    .no-expand-icon {
      width: 12px;
      height: 12px;
      border-radius: 50%;
    }
  }
  .child-count-icon {
    background-color: var(--color-primary-light-1);
    color: var(--color-primary);
    border-radius: 50%;
    width: 16px;
    height: 16px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 10px;
    font-weight: 500;
    line-height: 1;
  }

  .span-item {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    position: relative;

    .span-info {
      display: flex;
      align-items: center;
      gap: 8px;
      flex-shrink: 0;
      overflow: hidden;
      .span-name {
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
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
  :deep(.arco-tree-node-title) {
    display: flex;
    padding-right: 0;
    margin-left: 0;
  }
  :deep(.arco-tree-node-title-text) {
    flex: 1;
  }
</style>
