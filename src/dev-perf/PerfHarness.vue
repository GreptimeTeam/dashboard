<template lang="pug">
.perf-harness
  .perf-bar
    span {{ label }}
  .perf-grid
    DataGrid(
      :data="data"
      :columns="columns"
      :ts-column="tsColumn"
      :pagination="paginationConfig"
      :page-size="pageSize"
      :virtual="virtualMode"
      :wrap-line="wrapLine"
      :size="size"
      :leftover-strategy="leftover"
      :fill-height="fillHeight"
    )
</template>

<script setup lang="ts">
  import { computed, nextTick, onMounted, ref } from 'vue'
  import DataGrid from '@/components/data-grid/DataGrid.vue'
  import type { ColumnType } from '@/types/query'

  const params = new URLSearchParams(window.location.search)
  const colCount = clamp(Number(params.get('cols')) || 40, 2, 300)
  const rowsParam = Math.max(1, Number(params.get('rows')) || 20)
  const pageSize = Math.max(5, Number(params.get('pageSize')) || 20)
  const paginated = params.get('pagination') !== '0'
  const wrapLine = params.get('wrap') === '1'
  const size = (params.get('size') || 'medium') as 'small' | 'mini' | 'medium' | 'large'
  const fillHeight = params.get('fill') !== '0'
  const leftover = (params.get('leftover') || 'last-column') as 'last-column' | 'proportional'
  const virtualMode = params.get('virtual') === '0' ? false : ('auto' as const)
  // A deliberately oversized column, so tests can prove widths are content-driven
  // (a silently broken width rule falls back to equal-width columns).
  const longColumn = params.get('long') === '1'

  const tsColumn = { name: 'timestamp', data_type: 'TimestampNanosecond' }

  const columns: ColumnType[] = [
    { name: 'timestamp', data_type: 'TimestampNanosecond', title: 'timestamp' },
    ...Array.from({ length: colCount - 1 }, (_, i) => ({
      name: `field_${i}`,
      data_type: 'String',
      title: `field_${i}`,
    })),
  ]

  function clamp(n: number, min: number, max: number) {
    return Math.min(max, Math.max(min, n))
  }

  function makeRows(n: number, seed = 0) {
    return Array.from({ length: n }, (_, r) => {
      const row: Record<string, unknown> = {}
      // TimestampNanosecond: seconds → ns, so every row formats to a distinct wall clock.
      row.timestamp = (1731000000 + (r + seed)) * 1_000_000_000
      for (let i = 0; i < colCount - 1; i += 1) {
        // Deterministic, mixed-length content so column fitting is realistic.
        // Long value on one column when using wrap so row heights actually vary.
        row[`field_${i}`] =
          wrapLine && i === 0
            ? `row-${r + seed} ` + 'long wrapped content segment '.repeat(3 + (r % 4))
            : longColumn && i === 0
            ? `row-${r + seed}-` + 'wide-content-'.repeat(12)
            : i % 7 === 0
            ? `row-${r + seed}-col-${i}`
            : `v${r}`
      }
      return row
    })
  }

  const data = ref<Record<string, unknown>[]>([])
  const label = computed(
    () =>
      `${data.value.length} rows × ${colCount} cols · ${paginated ? `paginated ${pageSize}/page` : 'unpaginated'}${
        wrapLine ? ' · wrap' : ''
      }${fillHeight ? '' : ' · auto-height'}${leftover === 'proportional' ? ' · proportional' : ''}`
  )
  const paginationConfig = computed(() => (paginated ? { pageSize } : false))

  function frames(n = 2) {
    return new Promise<void>((resolve) => {
      let left = n
      const tick = () => {
        left -= 1
        if (left <= 0) resolve()
        else requestAnimationFrame(tick)
      }
      requestAnimationFrame(tick)
    })
  }

  let lastSeed = 0

  /** Swap the result set and report the time until the grid has painted. */
  async function reload(rowCount: number, seed?: number) {
    const start = performance.now()
    lastSeed = seed ?? Math.floor(Math.random() * 1000)
    data.value = makeRows(rowCount, lastSeed)
    await nextTick()
    await frames(2)
    return performance.now() - start
  }

  /** Reload with identical content — used to assert layout idempotency. */
  function reloadSame() {
    return reload(rowsParam, lastSeed)
  }

  onMounted(async () => {
    const start = performance.now()
    data.value = makeRows(rowsParam)
    await nextTick()
    await frames(2)
    // Exposed for the Playwright perf spec.
    ;(window as unknown as Record<string, unknown>).__perf = {
      mountMs: performance.now() - start,
      reload,
      reloadSame,
      cells: () => ({
        rows: document.querySelectorAll('.vxe-body--row').length,
        cols: document.querySelectorAll('.vxe-header--column').length,
        cells: document.querySelectorAll('.vxe-body--column').length,
      }),
    }
    ;(window as unknown as Record<string, unknown>).__perfReady = true
  })
</script>

<style scoped>
  .perf-harness {
    display: flex;
    flex-direction: column;
    height: 100vh;
  }

  .perf-bar {
    flex: 0 0 auto;
    padding: 6px 10px;
    border-bottom: 1px solid rgba(71, 52, 96, 0.09);
    font: 12px/1.4 ui-monospace, monospace;
  }

  .perf-grid {
    flex: 1;
    min-height: 0;
    overflow: hidden;
  }
</style>
