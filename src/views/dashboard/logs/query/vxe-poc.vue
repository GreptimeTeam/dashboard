<template lang="pug">
.vxe-poc-page
  .vxe-poc-toolbar
    a-space
      a-tag(color="arcoblue") VXE Logs PoC
      span {{ data.length }} rows × {{ colCount }} cols
      a-radio-group(v-model="columnMode" type="button" size="small")
        a-radio(value="separate") Table (separate)
        a-radio(value="merged") Logs (merged)
      a-checkbox(v-model="wrapLine" size="small")
        span Wrap lines
      a-button(size="small" type="outline" @click="appendRows(200)") Append 200
      a-button(size="small" type="outline" @click="resetData") Reset 1000
    .vxe-poc-hints
      | P0: scroll vertically + horizontally — header must stay aligned. Append must not flash-remount. Toggle Wrap for dynamic row height.
  .vxe-poc-table-wrap
    LogsVxeTable(
      size="medium"
      :data="data"
      :columns="columns"
      :displayed-columns="displayedColumns"
      :ts-column="tsColumn"
      :column-mode="columnMode"
      :loading="loading"
      :wrap-line="wrapLine"
      @reach-end="onReachEnd"
      @ts-cell-click="onTsClick"
    )
  a-modal(v-model:visible="detailVisible" title="Row detail (stub)" :footer="false")
    pre.vxe-poc-detail {{ detailJson }}
</template>

<script setup lang="ts">
  import { computed, ref } from 'vue'
  import { Message } from '@arco-design/web-vue'
  import type { ColumnType, TSColumn } from '@/types/query'
  import LogsVxeTable from '@/components/logs-vxe-table/LogsVxeTable.vue'

  type Row = Record<string, unknown> & { __rowIndex: number }

  const COLUMN_COUNT = 20
  const INITIAL_ROWS = 1000

  const columnMode = ref<'separate' | 'merged' | 'merged-with-keys'>('separate')
  const wrapLine = ref(false)
  const loading = ref(false)
  const data = ref<Row[]>([])
  const detailVisible = ref(false)
  const detailJson = ref('')

  const tsColumn: TSColumn = { name: 'greptime_timestamp', data_type: 'TimestampMillisecond' }

  const columns = computed<ColumnType[]>(() => {
    const cols: ColumnType[] = [
      { name: 'greptime_timestamp', data_type: 'TimestampMillisecond', title: 'greptime_timestamp' },
    ]
    for (let i = 0; i < COLUMN_COUNT - 1; i += 1) {
      cols.push({
        name: `field_${i}`,
        data_type: 'String',
        title: `field_${i}`,
      })
    }
    return cols
  })

  const displayedColumns = computed(() => columns.value.map((c) => c.name))
  const colCount = computed(() => displayedColumns.value.length)

  function makeRow(index: number): Row {
    const row: Row = {
      __rowIndex: index,
      greptime_timestamp: new Date(Date.now() - index * 1000).toISOString(),
    }
    for (let i = 0; i < COLUMN_COUNT - 1; i += 1) {
      // Longer strings so wrap mode visibly grows row height under maxWidth:600.
      const pad = 'x'.repeat(8 + (i % 5))
      const extra = i % 7 === 0 ? ` long_payload_${index}_${'Z'.repeat(120)}` : ''
      row[`field_${i}`] = `value_${i}_row_${index}_${pad}${extra}`
    }
    return row
  }

  function resetData() {
    data.value = Array.from({ length: INITIAL_ROWS }, (_, i) => makeRow(i))
  }

  function appendRows(n: number) {
    const start = data.value.length
    const extra = Array.from({ length: n }, (_, i) => makeRow(start + i))
    data.value = data.value.concat(extra)
    Message.success(`Appended ${n}, total ${data.value.length}`)
  }

  function onReachEnd() {
    Message.info('reachEnd')
    appendRows(200)
  }

  function onTsClick(row: Row) {
    detailJson.value = JSON.stringify(row, null, 2)
    detailVisible.value = true
  }

  resetData()
</script>

<style lang="less" scoped>
  .vxe-poc-page {
    display: flex;
    flex-direction: column;
    height: calc(100vh - 60px);
    padding: 12px 16px;
    gap: 8px;
    box-sizing: border-box;
  }

  .vxe-poc-toolbar {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .vxe-poc-hints {
    font-size: 12px;
    color: var(--color-text-3);
  }

  .vxe-poc-table-wrap {
    flex: 1;
    min-height: 0;
    border: 1px solid var(--color-border-2);
    border-radius: 4px;
    overflow: hidden;
  }

  .vxe-poc-detail {
    max-height: 60vh;
    overflow: auto;
    font-size: 12px;
  }
</style>
