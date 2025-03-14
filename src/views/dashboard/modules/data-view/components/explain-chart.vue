<template>
  <!-- The tree will be drawn into this div -->
  <div ref="chartContainer" style="padding: 8px"></div>
</template>

<script lang="ts" setup>
  import { onMounted, ref, watch } from 'vue'
  import * as d3 from 'd3'
  import { flextree } from 'd3-flextree'
  import ArcoVue from '@arco-design/web-vue/es/arco-vue'

  const props = defineProps<{ data: any }>()

  const chartContainer = ref<HTMLDivElement | null>(null)

  function toHierarchy(plan: any) {
    return {
      name: plan.name || 'Root',
      metrics: plan.metrics,
      children: (plan.children || []).map((child) => toHierarchy(child)),
    }
  }

  const clickNode = (node: any) => {
    console.log(node, 'node')
  }

  function renderTree() {
    if (!chartContainer.value) return
    chartContainer.value.innerHTML = ''

    const margin = { top: 20, right: 20, bottom: 20, left: 20 }
    const width = 600
    const height = 400

    const svg = d3.select(chartContainer.value).append('svg').attr('width', width).attr('height', height)

    if (!props.data) return
    const rootData = toHierarchy(JSON.parse(props.data[2]))

    const layout = flextree()
      .nodeSize([200, 120])
      .spacing(() => 30)

    const root = layout(d3.hierarchy(rootData))

    let minX = Infinity
    let maxX = -Infinity
    let minY = Infinity
    let maxY = -Infinity

    root.each((d) => {
      minX = Math.min(minX, d.x)
      maxX = Math.max(maxX, d.x)
      minY = Math.min(minY, d.y)
      maxY = Math.max(maxY, d.y)
    })

    const treeWidth = maxX - minX + margin.left + margin.right
    const treeHeight = maxY - minY + margin.top + margin.bottom

    const actualWidth = Math.max(treeWidth, 600)
    const actualHeight = Math.max(treeHeight, 400)

    svg.attr('width', actualWidth).attr('height', actualHeight)

    const centerOffsetX = (actualWidth - treeWidth) / 2
    const centerOffsetY = (actualHeight - treeHeight) / 2

    const g = svg
      .append('g')
      .attr(
        'transform',
        `translate(${margin.left + Math.abs(minX) + centerOffsetX}, ${margin.top + Math.abs(minY) + centerOffsetY})`
      )

    g.selectAll('.link')
      .data(root.links())
      .enter()
      .append('path')
      .attr('class', 'link')
      .attr('fill', 'none')
      .attr('stroke', '#555')
      .attr('stroke-width', 1.5)
      .attr(
        'd',
        d3
          .linkHorizontal()
          .x((d) => d.x)
          .y((d) => d.y)
      )

    const node = g
      .selectAll('.node')
      .data(root.descendants())
      .enter()
      .append('g')
      .attr('class', 'node')
      .attr('transform', (d) => `translate(${d.x - 100},${d.y - 40})`) // Adjust center point

    node
      .append('foreignObject')
      .attr('width', 200)
      .attr('height', 80)
      .html(
        (d) => `
      <div style="width: 200px; height: 80px; display: flex; align-items: center; justify-content: center">
        <div class="plan-card" style="width: 180px">
          <div class="plan-name">${d.data.name}</div>
          ${
            d.data.metrics
              ? `
            <div class="plan-metrics">
              ${Object.entries(d.data.metrics)
                .map(
                  ([key, value]) => `
                  <div class="metric-item">
                    <span class="metric-key">${key}:</span>
                    <span class="metric-value">${value}</span>
                  </div>
                `
                )
                .join('')}
            </div>
          `
              : ''
          }
        </div>
      </div>
    `
      )
      .on('click', (event, d) => clickNode(d)) // Add click handler here instead
  }

  onMounted(() => {
    renderTree()
  })

  watch(
    () => props.data,
    () => {
      console.log('Data changed, re-rendering tree')
      renderTree()
    }
  )
</script>

<style lang="less">
  .plan-card {
    background-color: #f0f0f0;
    border-radius: 4px;
    padding: 8px;
    cursor: pointer;

    .plan-name {
      font-weight: bold;
      margin-bottom: 4px;
    }

    .plan-metrics {
      font-size: 12px;
      color: #666;
    }

    .metric-item {
      display: flex;
      justify-content: space-between;
      margin: 2px 0;
    }

    .metric-key {
      margin-right: 8px;
    }

    .metric-value {
      font-family: monospace;
    }
  }
</style>
