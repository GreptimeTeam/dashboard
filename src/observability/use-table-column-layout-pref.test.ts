import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ref, type Ref } from 'vue'
import useTableColumnLayoutPref from './use-table-column-layout-pref'

/**
 * The composable only talks to the app store through three uiConfig accessors, so the
 * store is stubbed with a reactive bag. That keeps these tests on the layout logic
 * (per-table keying, hidden order, legacy drain, write skipping) without booting the
 * real store.
 */
const hoisted = vi.hoisted(() => ({ state: {} as Record<string, unknown> }))

vi.mock('@/store', async () => {
  const { reactive } = await import('vue')
  const state = reactive(hoisted.state)
  const store = {
    getUiConfigValue: (key: string) => state[key],
    setUiConfigValue: (key: string, value: unknown) => {
      state[key] = value
    },
    removeUiConfigKeys: (keys: string[]) => {
      keys.forEach((key) => {
        delete state[key]
      })
    },
  }
  return { useAppStore: () => store }
})

function mount(table: Ref<string>) {
  return useTableColumnLayoutPref('logsTableColumns', 'logsTableHiddenColumns', () => table.value)
}

describe('useTableColumnLayoutPref', () => {
  let table: Ref<string>

  beforeEach(() => {
    Object.keys(hoisted.state).forEach((key) => {
      delete hoisted.state[key]
    })
    table = ref('')
  })

  it('keeps layouts per table so switching tables never hides columns', () => {
    table.value = 'logs_a'
    const prefs = mount(table)
    expect(prefs.displayedColumnsFor(['a1', 'a2'])).toEqual(['a1', 'a2'])

    prefs.setVisibleColumns(['a1', 'a2'], ['a1'])
    expect(hoisted.state.logsTableColumns).toEqual({ logs_a: { hidden: ['a2'] } })

    // Table B was never customized: every column visible, nothing reported hidden.
    table.value = 'logs_b'
    expect(prefs.displayedColumnsFor(['b1', 'b2', 'b3'])).toEqual(['b1', 'b2', 'b3'])
    expect(prefs.hiddenColumnCountFor(['b1', 'b2'])).toBe(0)

    // Back on A the saved layout still applies, and a new column shows up visible.
    table.value = 'logs_a'
    expect(prefs.displayedColumnsFor(['a1', 'a2', 'a3'])).toEqual(['a1', 'a3'])
  })

  it('persists the order of hidden rows dragged in the column panel', () => {
    table.value = 'logs_a'
    const prefs = mount(table)
    // a2 is hidden; the panel drag put a3, a2, a1 in that order.
    prefs.setColumnLayout(['a1', 'a2', 'a3'], ['a3', 'a2', 'a1'], ['a3', 'a1'])

    expect(hoisted.state.logsTableColumns).toEqual({
      logs_a: { hidden: ['a2'], order: ['a3', 'a2', 'a1'] },
    })
    expect(prefs.orderedColumnsFor(['a1', 'a2', 'a3'])).toEqual(['a3', 'a2', 'a1'])
    expect(prefs.displayedColumnsFor(['a1', 'a2', 'a3'])).toEqual(['a3', 'a1'])

    // Unhiding a2 keeps the dragged position instead of appending it.
    prefs.setVisibleColumns(['a1', 'a2', 'a3'], ['a3', 'a2', 'a1'])
    expect(prefs.displayedColumnsFor(['a1', 'a2', 'a3'])).toEqual(['a3', 'a2', 'a1'])
  })

  it('keeps hidden columns in their slots on a header drag', () => {
    table.value = 'logs_a'
    const prefs = mount(table)
    prefs.setVisibleColumns(['a1', 'a2', 'a3'], ['a1', 'a3'])
    // Grid drag reports the new visible order only; a2 stays hidden between them.
    prefs.setColumnOrder(['a1', 'a2', 'a3'], ['a3', 'a1'])

    expect(hoisted.state.logsTableColumns).toEqual({
      logs_a: { hidden: ['a2'], order: ['a3', 'a2', 'a1'] },
    })
    expect(prefs.displayedColumnsFor(['a1', 'a2', 'a3'])).toEqual(['a3', 'a1'])
  })

  it('reads the released global deny list, then drains it per table', () => {
    hoisted.state.logsTableHiddenColumns = ['a2', 'b9']
    table.value = 'logs_a'
    const prefs = mount(table)
    expect(prefs.displayedColumnsFor(['a1', 'a2'])).toEqual(['a1'])

    prefs.setVisibleColumns(['a1', 'a2'], ['a1'])
    expect(hoisted.state.logsTableColumns).toEqual({ logs_a: { hidden: ['a2'] } })
    expect(hoisted.state.logsTableHiddenColumns).toEqual(['b9'])

    // The legacy list still covers tables that have not been customized yet.
    table.value = 'logs_b'
    expect(prefs.displayedColumnsFor(['b1', 'b9'])).toEqual(['b1'])

    prefs.setVisibleColumns(['b1', 'b9'], ['b1'])
    expect(hoisted.state.logsTableHiddenColumns).toBeUndefined()
  })

  it('drops the entry when a table is reset to the default layout', () => {
    table.value = 'logs_a'
    const prefs = mount(table)
    prefs.setColumnOrder(['a1', 'a2'], ['a2', 'a1'])
    expect(hoisted.state.logsTableColumns).toEqual({ logs_a: { order: ['a2', 'a1'] } })

    prefs.setColumnOrder(['a1', 'a2'], ['a1', 'a2'])
    expect(hoisted.state.logsTableColumns).toBeUndefined()
  })

  it('skips writes when the layout did not change', () => {
    table.value = 'logs_a'
    const prefs = mount(table)
    prefs.setColumnOrder(['a1', 'a2'], ['a2', 'a1'])
    const stored = hoisted.state.logsTableColumns

    prefs.setColumnOrder(['a1', 'a2'], ['a2', 'a1'])
    expect(hoisted.state.logsTableColumns).toBe(stored)
  })

  it('keys qualified table refs by their bare name', () => {
    table.value = 'public.logs_a'
    const prefs = mount(table)
    prefs.setVisibleColumns(['a1', 'a2'], ['a1'])
    expect(Object.keys(hoisted.state.logsTableColumns as object)).toEqual(['logs_a'])

    // Logs Query and drilldown Logs resolve the same table differently — same layout.
    table.value = 'logs_a'
    expect(prefs.displayedColumnsFor(['a1', 'a2'])).toEqual(['a1'])
  })

  it('does not persist without a table identity', () => {
    table.value = ''
    const prefs = mount(table)
    prefs.setVisibleColumns(['a1'], [])
    expect(hoisted.state.logsTableColumns).toBeUndefined()
  })

  it('discards legacy stored values and replaces them on the next write', () => {
    hoisted.state.logsTableColumns = ['a2', 'a1']
    table.value = 'logs_a'
    const prefs = mount(table)

    // Old allowlist shape: ignored, every column visible again (never throws).
    expect(prefs.displayedColumnsFor(['a1', 'a2'])).toEqual(['a1', 'a2'])

    prefs.setVisibleColumns(['a1', 'a2'], ['a1'])
    expect(hoisted.state.logsTableColumns).toEqual({ logs_a: { hidden: ['a2'] } })
  })

  it('drives the trace keys for trace tables, independently of logs', () => {
    table.value = 'otel_traces'
    hoisted.state.logsTableColumns = { logs_a: { hidden: ['a1'] } }
    hoisted.state.traceTableHiddenColumns = ['span', 'svc']
    const prefs = useTableColumnLayoutPref('traceTableColumns', 'traceTableHiddenColumns', () => table.value)

    // Legacy trace deny list applies until the trace table is customized.
    expect(prefs.displayedColumnsFor(['span', 'svc', 'ts'])).toEqual(['ts'])

    prefs.setVisibleColumns(['span', 'svc', 'ts'], ['span', 'ts'])
    expect(hoisted.state.traceTableColumns).toEqual({ otel_traces: { hidden: ['svc'] } })
    expect(hoisted.state.traceTableHiddenColumns).toBeUndefined()
    expect(hoisted.state.logsTableColumns).toEqual({ logs_a: { hidden: ['a1'] } })

    // Per trace table: another trace table keeps every column.
    table.value = 'otel_spans_other'
    expect(prefs.displayedColumnsFor(['x', 'y'])).toEqual(['x', 'y'])
  })
})
