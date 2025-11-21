<template lang="pug">
.zoom-controls
  a-button(type="text" size="mini" @click="handleZoomIn")
    template(#icon)
      IconZoomIn
  a-button(type="text" size="mini" @click="handleResetZoom")
    template(#icon)
      IconRefresh
  a-button(type="text" size="mini" @click="handleZoomOut")
    template(#icon)
      IconZoomOut
</template>

<script lang="ts" setup name="ZoomControls">
  import * as d3 from 'd3'
  import { onMounted, onBeforeUnmount, nextTick } from 'vue'
  import { IconZoomIn, IconZoomOut, IconRefresh } from '@arco-design/web-vue/es/icon'

  const props = defineProps<{
    treeContainer: HTMLDivElement | null
  }>()

  // Zoom configuration
  const minScale = 0.1
  const maxScale = 3
  const lastTransform = ref<d3.ZoomTransform | null>(null)

  // Create the zoom behavior (not computed, created once)
  const zoomListener = d3
    .zoom<SVGSVGElement, unknown>()
    .scaleExtent([minScale, maxScale])
    .on('zoom', (event) => {
      if (!props.treeContainer) return
      const g = d3.select(props.treeContainer).select('svg > g')
      g.attr('transform', event.transform.toString())
      lastTransform.value = event.transform
    })

  // Get SVG element from tree container
  function getSvg() {
    if (!props.treeContainer) return null
    return d3.select(props.treeContainer).select<SVGSVGElement>('svg')
  }

  // Apply zoom behavior to SVG (called when SVG is created via event)
  function applyZoom(
    svg: d3.Selection<SVGSVGElement, unknown, null, undefined>,
    preservedTransform: d3.ZoomTransform | null = null
  ) {
    if (!props.treeContainer) return

    // Set explicit dimensions first
    svg
      .attr('width', props.treeContainer.clientWidth || 800)
      .attr('height', props.treeContainer.clientHeight || 600)
      .attr('viewBox', null)

    // Apply zoom behavior
    svg.call(zoomListener)

    // Restore preserved transform or set an initial transform
    if (preservedTransform) {
      svg.call(zoomListener.transform, preservedTransform)
      lastTransform.value = preservedTransform
    } else {
      // Initial Y offset matches tree container's Y offset (20px)
      // Default scale is 1.0 (no scaling) - fonts will appear at their set size
      const initial = d3.zoomIdentity.translate(0, 0).scale(1.0)
      svg.call(zoomListener.transform, initial)
      lastTransform.value = initial
    }
  }

  // Zoom control functions
  function handleZoomIn() {
    const svg = getSvg()
    if (!svg) return
    ;(svg.transition().duration(300) as any).call(zoomListener.scaleBy, 1.3) // eslint-disable-line @typescript-eslint/no-explicit-any
  }

  function handleZoomOut() {
    const svg = getSvg()
    if (!svg) return
    ;(svg.transition().duration(300) as any).call(zoomListener.scaleBy, 1 / 1.3) // eslint-disable-line @typescript-eslint/no-explicit-any
  }

  function handleResetZoom() {
    const svg = getSvg()
    if (!svg) return
    // Reset to the same initial transform used in applyZoom (centered)
    const initial = d3.zoomIdentity.translate(0, 0).scale(1.0)
    ;(svg as any).call(zoomListener.transform, initial) // eslint-disable-line @typescript-eslint/no-explicit-any
    lastTransform.value = initial
  }

  // Scroll to a specific transform (used for node tree navigation)
  function scrollToTransform(transform: d3.ZoomTransform) {
    const svg = getSvg()
    if (!svg) return
    ;(svg.transition().duration(500) as any).call(zoomListener.transform, transform) // eslint-disable-line @typescript-eslint/no-explicit-any
  }

  // Handle window resize - reset zoom to fit new dimensions
  function handleResize() {
    nextTick(() => {
      handleResetZoom()
    })
  }

  // Set up resize listener on mount
  onMounted(() => {
    window.addEventListener('resize', handleResize)
  })

  // Clean up resize listener on unmount
  onBeforeUnmount(() => {
    window.removeEventListener('resize', handleResize)
  })

  // Expose methods for tree-view and parent to use
  defineExpose({
    applyZoom,
    getLastTransform: () => lastTransform.value,
    getZoomListener: () => zoomListener,
    handleResetZoom,
    scrollToTransform,
  })
</script>
