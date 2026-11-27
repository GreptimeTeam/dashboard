import { describe, expect, it } from 'vitest'
import { alignStagePlans, getSlotOperators, groupNodeParams, parseStagePlan, type StageRow } from './utils'

const op = (name: string, param = '', rows = 0, children: any[] = []) => ({
  name,
  param,
  output_rows: rows,
  elapsed_compute: rows * 10,
  metrics: {},
  children,
})

const scanPlan = (filter: string, rows: number, region = 'region=1') =>
  op('FilterExec', filter, rows, [op('CooperativeExec', '', 0, [op('UnorderedScan', region, rows)])])

const row = (stage: number, node: number, plan: any): StageRow => [stage, node, JSON.stringify(plan)]

describe('alignStagePlans', () => {
  it('aligns plans with different root params by content', () => {
    const rows: StageRow[] = [
      row(1, 0, scanPlan('a IS NOT NULL', 10)),
      row(1, 1, scanPlan('a IS NOT NULL', 11)),
      row(1, 0, scanPlan('b IS NOT NULL', 20)),
      row(1, 1, scanPlan('b IS NOT NULL', 21)),
    ]
    const { slots } = alignStagePlans(rows)

    expect(slots).toHaveLength(2)
    expect([...slots[0].byNode.keys()]).toEqual([0, 1])
    expect(slots[0].param).toBe('a IS NOT NULL')
    expect(slots[1].param).toBe('b IS NOT NULL')
    // Same name, different param: the param tells the roots apart, no number needed.
    expect(slots.map((slot) => slot.label)).toEqual([
      { param: 'a IS NOT NULL', ordinal: 0 },
      { param: 'b IS NOT NULL', ordinal: 0 },
    ])
  })

  it('keeps content matching when a node lacks one of the plans', () => {
    const rows: StageRow[] = [
      row(1, 0, scanPlan('a IS NOT NULL', 10)),
      row(1, 1, scanPlan('a IS NOT NULL', 11)),
      row(1, 0, scanPlan('b IS NOT NULL', 20)),
      // node 1 has no plan for b
    ]
    const { slots } = alignStagePlans(rows)

    expect(slots).toHaveLength(2)
    expect([...slots[0].byNode.keys()]).toEqual([0, 1])
    expect([...slots[1].byNode.keys()]).toEqual([0])
  })

  it('numbers identical plans (self-join) by occurrence on each node', () => {
    const rows: StageRow[] = [
      row(1, 0, scanPlan('Et@1 IS NOT NULL', 10)),
      row(1, 1, scanPlan('Et@1 IS NOT NULL', 11)),
      row(1, 0, scanPlan('Et@1 IS NOT NULL', 20)),
      row(1, 1, scanPlan('Et@1 IS NOT NULL', 21)),
    ]
    const { slots, slotByRow } = alignStagePlans(rows)

    expect(slots).toHaveLength(2)
    expect(slots.map((slot) => slot.label)).toEqual([
      { param: '', ordinal: 1 },
      { param: '', ordinal: 2 },
    ])
    expect(slots[0].byNode.get(0).output_rows).toBe(10)
    expect(slots[1].byNode.get(1).output_rows).toBe(21)
    expect(slotByRow.get(rows[2])).toBe(slots[1])
  })

  it('shifts ordinals when a node lacks an identical plan (known best-effort limit)', () => {
    const rows: StageRow[] = [
      row(1, 0, scanPlan('x', 10)),
      row(1, 1, scanPlan('x', 11)),
      row(1, 0, scanPlan('x', 20)),
      // node 1 ran only one of the two identical plans: it is taken as the first one
    ]
    const { slots } = alignStagePlans(rows)

    expect([...slots[0].byNode.keys()]).toEqual([0, 1])
    expect([...slots[1].byNode.keys()]).toEqual([0])
  })

  it('ignores param for a scan root so node specific regions still align', () => {
    const rows: StageRow[] = [
      row(1, 0, op('UnorderedScan', 'region=100(1, 0), {"files": []}', 10)),
      row(1, 1, op('UnorderedScan', 'region=101(1, 1), {"files": []}', 11)),
    ]
    const { slots } = alignStagePlans(rows)

    expect(slots).toHaveLength(1)
    expect([...slots[0].byNode.keys()]).toEqual([0, 1])
    expect(slots[0].label).toEqual({ param: '', ordinal: 0 })
  })

  it('needs no label for a single plan or for roots with different names', () => {
    const single = alignStagePlans([row(0, 0, op('SortExec', 'x', 1))])
    expect(single.slots[0].label).toEqual({ param: '', ordinal: 0 })

    const mixed = alignStagePlans([row(0, 0, op('SortExec', '', 1)), row(0, 0, op('FilterExec', '', 1))])
    expect(mixed.slots.map((slot) => slot.label)).toEqual([
      { param: '', ordinal: 0 },
      { param: '', ordinal: 0 },
    ])
  })

  it('skips the footer row and rows that are not plans', () => {
    const rows = [
      row(1, 0, scanPlan('a', 1)),
      [null, null, 'Total rows: 41'],
      [1, 0, 'not json'],
    ] as unknown as StageRow[]
    const { slots, nodeIds } = alignStagePlans(rows)

    expect(slots).toHaveLength(1)
    expect(nodeIds).toContain(0)
  })
})

describe('getSlotOperators', () => {
  it('gives same-name sibling operators their own rows and metrics', () => {
    const join = (left: number, right: number) =>
      op('HashJoinExec', '', 1, [
        op('RepartitionExec', 'left', left, [op('MergeScanExec', '', left)]),
        op('RepartitionExec', 'right', right, [op('MergeScanExec', '', right)]),
      ])
    const { slots } = alignStagePlans([row(0, 0, join(7, 8))])
    const rows = getSlotOperators(slots[0])

    expect(rows.map((item) => item.path)).toEqual(['', '0', '0/0', '1', '1/0'])
    expect(new Set(rows.map((item) => item.key)).size).toBe(rows.length)
    expect(rows[1].byNode.get(0).output_rows).toBe(7)
    expect(rows[3].byNode.get(0).output_rows).toBe(8)
  })

  it('draws tree characters like a single plan', () => {
    const { slots } = alignStagePlans([row(1, 0, scanPlan('a', 1))])

    expect(getSlotOperators(slots[0]).map((item) => item.step)).toEqual([
      'FilterExec',
      '└─ CooperativeExec',
      '   └─ UnorderedScan',
    ])
  })

  it('keeps operators that only some nodes have, and leaves the other nodes empty', () => {
    const base = scanPlan('a', 10)
    const extra = op('FilterExec', 'a', 11, [
      op('CooperativeExec', '', 0, [op('UnorderedScan', 'r', 11)]),
      op('ProjectionExec', '', 11),
    ])
    const { slots } = alignStagePlans([row(1, 0, base), row(1, 1, extra)])
    const rows = getSlotOperators(slots[0])

    const projection = rows.find((item) => item.name === 'ProjectionExec')
    expect([...(projection?.byNode.keys() ?? [])]).toEqual([1])
    // Operators both nodes have are still shared.
    expect([...rows[0].byNode.keys()]).toEqual([0, 1])
  })

  it('does not merge different operators found at the same position', () => {
    const a = op('FilterExec', '', 1, [op('SortExec', '', 1)])
    const b = op('FilterExec', '', 1, [op('ProjectionExec', '', 1)])
    const { slots } = alignStagePlans([row(1, 0, a), row(1, 1, b)])
    const rows = getSlotOperators(slots[0])

    expect(rows.map((item) => item.name)).toEqual(['FilterExec', 'SortExec', 'ProjectionExec'])
    expect(new Set(rows.map((item) => item.key)).size).toBe(rows.length)
    expect([...rows[1].byNode.keys()]).toEqual([0])
    expect([...rows[2].byNode.keys()]).toEqual([1])
  })
})

describe('groupNodeParams', () => {
  const byNode = (entries: Array<[number, string | undefined]>) =>
    new Map<number, any>(entries.map(([node, param]) => [node, { name: 'UnorderedScan', param }]))

  it('lists one group per distinct param with the nodes that share it', () => {
    const groups = groupNodeParams(
      byNode([
        [2, 'regions=[b]'],
        [0, 'regions=[a]'],
        [1, 'regions=[a]'],
      ])
    )

    expect(groups).toEqual([
      { nodes: [0, 1], param: 'regions=[a]' },
      { nodes: [2], param: 'regions=[b]' },
    ])
  })

  it('returns a single group when every node has the same param', () => {
    expect(
      groupNodeParams(
        byNode([
          [0, 'x > 1'],
          [1, 'x > 1'],
        ])
      )
    ).toEqual([{ nodes: [0, 1], param: 'x > 1' }])
  })

  it('leaves out nodes without a param', () => {
    expect(
      groupNodeParams(
        byNode([
          [0, undefined],
          [1, ''],
          [2, 'x > 1'],
        ])
      )
    ).toEqual([{ nodes: [2], param: 'x > 1' }])
    expect(groupNodeParams(byNode([[0, undefined]]))).toEqual([])
  })
})

describe('parseStagePlan', () => {
  it('returns the plan object, or null for anything else', () => {
    expect(parseStagePlan('{"name":"FilterExec"}')).toEqual({ name: 'FilterExec' })
    expect(parseStagePlan('Total rows: 41')).toBeNull()
    expect(parseStagePlan('{"name": ')).toBeNull()
    expect(parseStagePlan(null)).toBeNull()
    expect(parseStagePlan({ name: 'x' })).toBeNull()
  })
})
