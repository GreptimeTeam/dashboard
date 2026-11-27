export const CARD_DIMENSIONS = {
  width: 200,
  minHeight: 40,
  progressBarHeight: 30,
  singleMetricHeight: 20,
  expandedBaseHeight: 25,
  metricLineHeight: 18,
  padding: 20, // Padding between nodes
  horizontalPadding: 60, // Add this new parameter for horizontal spacing
}

export const NODE_INDEX_CARD = {
  width: 70,
  height: 30,
  fontSize: 12,
}

export function formatNumber(value) {
  return new Intl.NumberFormat().format(value)
}

export function formatTimeValue(nanoseconds) {
  if (nanoseconds === undefined || nanoseconds === null) return '0'

  if (nanoseconds < 1000) return `${nanoseconds}ns`
  if (nanoseconds < 1000000) return `${(nanoseconds / 1000).toFixed(2)}μs`
  if (nanoseconds < 1000000000) return `${(nanoseconds / 1000000).toFixed(2)}ms`
  return `${(nanoseconds / 1000000000).toFixed(2)}s`
}

export function formatMetricValue(key, value) {
  if (typeof value === 'number') {
    if (key.includes('elapsed_compute')) {
      return formatTimeValue(value)
    }

    return formatNumber(value)
  }
  return value
}

export function getProgressColor(percentage) {
  if (percentage < 20) return 'var(--success-color)'
  if (percentage < 80) return 'var(--warning-color)'
  return 'var(--danger-color)'
}

export function formatMetricName(key: string): string {
  const map: Record<string, string> = {
    output_rows: 'Rows',
    elapsed_compute: 'Duration',
  }
  return (
    map[key] ||
    key
      .split('_')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ')
  )
}

// A stage row is `[stage, nodeIndex, plan_json_string]`; rows without a JSON plan (footers) are ignored.
export type StageRow = [number, number, string]

// Plan JSON of a stage row, or null when the row is not a valid plan object (bad import, backend error
// text). Every view skips such rows instead of throwing.
export const parseStagePlan = (planStr: unknown): any | null => {
  if (typeof planStr !== 'string' || !planStr.startsWith('{')) return null
  try {
    const plan = JSON.parse(planStr)
    return plan && typeof plan === 'object' ? plan : null
  } catch {
    return null
  }
}

// Physical compute node ids that executed this stage, ascending.
export function getStageNodeIds(rows: StageRow[]): number[] {
  if (!rows?.length) return []
  return [...new Set(rows.map((row) => row[1]))].sort((a, b) => a - b)
}

// Rows and Duration are always drawn as progress bars, so they are not offered as extra metrics.
export const FIXED_EXPLAIN_METRICS = ['output_rows', 'elapsed_compute']

// Numeric metric keys in this stage that are not already shown as bars, sorted alphabetically.
export function getStageMetricKeys(rows: StageRow[]): string[] {
  const keys = new Set<string>()
  const walk = (node: any) => {
    if (!node) return
    Object.entries(node.metrics || {}).forEach(([key, value]) => {
      if (typeof value === 'number' && !FIXED_EXPLAIN_METRICS.includes(key)) keys.add(key)
    })
    node.children?.forEach(walk)
  }
  rows?.forEach((row) => walk(parseStagePlan(row[2])))
  return [...keys].sort((a, b) => a.localeCompare(b))
}

// ---------------------------------------------------------------------------------------------
// Plan alignment
//
// A stage row is `[stage, node, plan_json]`. A node can run several plan trees in one stage (e.g. both
// inputs of a JOIN) and nothing in the data says which tree is which: they are just rows with the same
// stage and node. To compare "the same plan" across nodes we derive a plan slot per tree:
//
//   slot key     = [root name, root param]   (a Scan root ignores param: it carries node specific region info)
//   slot ordinal = how many plans with the same slot key this node has already had (server order)
//   slot id      = `${key}#${ordinal}`
//
// Plans whose root name/param differ are matched by content. Plans that are identical (e.g. a self-join)
// can only be matched by order, which is best-effort: a node that lacks one of them shifts the ordinals.
// ---------------------------------------------------------------------------------------------

// Root operators that read storage carry node specific text in `param` (region id, file list).
const isScanOperator = (name: string): boolean => /Scan/.test(name)

const slotKeyOf = (plan: any): string =>
  JSON.stringify([plan.name ?? '', isScanOperator(plan.name ?? '') ? '' : plan.param ?? ''])

export interface StagePlanSlotLabel {
  // Only set when the stage has several plans whose roots share a name but differ in param.
  param: string
  // 1-based occurrence number; 0 when the plan is not repeated and needs no number.
  ordinal: number
}

export interface StagePlanSlot {
  id: string
  key: string
  // 0-based occurrence among plans with the same key on one node.
  ordinal: number
  name: string
  // Root param of the first plan seen in this slot (for display).
  param: string
  // node -> plan tree this node ran for this slot.
  byNode: Map<number, any>
  label: StagePlanSlotLabel
}

export interface StageAlignment {
  slots: StagePlanSlot[]
  // Lets a view that draws raw rows (the chart) find the slot of a row, using the whole stage.
  slotByRow: Map<StageRow, StagePlanSlot>
  nodeIds: number[]
}

const labelSlots = (slots: StagePlanSlot[]) => {
  const byName = new Map<string, StagePlanSlot[]>()
  slots.forEach((slot) => {
    const list = byName.get(slot.name) ?? []
    list.push(slot)
    byName.set(slot.name, list)
  })

  slots.forEach((slot) => {
    const sameName = byName.get(slot.name) ?? []
    if (sameName.length <= 1) {
      slot.label = { param: '', ordinal: 0 }
      return
    }
    const distinctKeys = new Set(sameName.map((item) => item.key)).size
    const sameKey = sameName.filter((item) => item.key === slot.key).length
    slot.label = {
      param: distinctKeys > 1 ? slot.param : '',
      ordinal: sameKey > 1 ? slot.ordinal + 1 : 0,
    }
  })
}

// Group the plans of a whole stage into slots. Always pass the whole stage, not a node or root filtered
// subset, so that the ordinals do not change when the user filters.
export function alignStagePlans(rows: StageRow[]): StageAlignment {
  const slots = new Map<string, StagePlanSlot>()
  const slotByRow = new Map<StageRow, StagePlanSlot>()
  const seenByNode = new Map<number, Map<string, number>>()

  rows?.forEach((row) => {
    const plan = parseStagePlan(row[2])
    if (!plan) return

    const node = row[1]
    const key = slotKeyOf(plan)
    const seen = seenByNode.get(node) ?? new Map<string, number>()
    seenByNode.set(node, seen)
    const ordinal = seen.get(key) ?? 0
    seen.set(key, ordinal + 1)

    const id = `${key}#${ordinal}`
    let slot = slots.get(id)
    if (!slot) {
      slot = {
        id,
        key,
        ordinal,
        name: plan.name ?? '',
        param: plan.param ?? '',
        byNode: new Map(),
        label: { param: '', ordinal: 0 },
      }
      slots.set(id, slot)
    }
    slot.byNode.set(node, plan)
    slotByRow.set(row, slot)
  })

  const slotList = [...slots.values()]
  labelSlots(slotList)
  return { slots: slotList, slotByRow, nodeIds: getStageNodeIds(rows) }
}

export interface AlignedOperator {
  // Unique across the stage: `${slot id}/${childIndexPath}`.
  key: string
  // Child indexes from the root, e.g. '' (root), '0', '0/1'. Operator names are not part of it, because
  // siblings can share a name (both inputs of a HashJoinExec are RepartitionExec).
  path: string
  depth: number
  name: string
  // Param of the first node that has this operator (for display).
  param: string
  // Name with tree drawing characters.
  step: string
  // node -> operator this node ran at this position; a node that lacks it has no entry.
  byNode: Map<number, any>
}

interface MergedOperator {
  name: string
  param: string
  index: number
  children: MergedOperator[]
  byNode: Map<number, any>
}

// Add one node's tree to the merged tree. Children match by position and name; an operator that exists
// on only some nodes still gets its own row.
const mergeOperator = (merged: MergedOperator, node: number, operator: any) => {
  merged.byNode.set(node, operator)
  const children: any[] = operator.children ?? []
  children.forEach((child, index) => {
    let target = merged.children.find((item) => item.index === index && item.name === child.name)
    if (!target) {
      target = { name: child.name ?? '', param: child.param ?? '', index, children: [], byNode: new Map() }
      merged.children.push(target)
    }
    mergeOperator(target, node, child)
  })
}

// Params of one operator position grouped by value, e.g. a scan's region and files differ per node while a
// filter expression is usually the same everywhere. Nodes without a param are left out; groups follow the
// first node of each value.
export interface NodeParamGroup {
  nodes: number[]
  param: string
}

export function groupNodeParams(byNode: Map<number, any>): NodeParamGroup[] {
  const groups = new Map<string, number[]>()
  ;[...byNode.keys()]
    .sort((a, b) => a - b)
    .forEach((node) => {
      const param = byNode.get(node)?.param
      if (typeof param !== 'string' || param === '') return
      const nodes = groups.get(param)
      if (nodes) nodes.push(node)
      else groups.set(param, [node])
    })
  return [...groups].map(([param, nodes]) => ({ nodes, param }))
}

// One row per operator position of a slot (union over the nodes that ran it), depth first, parent before
// children, with the same tree characters as a single plan.
export function getSlotOperators(slot: StagePlanSlot): AlignedOperator[] {
  const root: MergedOperator = { name: slot.name, param: slot.param, index: 0, children: [], byNode: new Map() }
  slot.byNode.forEach((plan, node) => mergeOperator(root, node, plan))

  const result: AlignedOperator[] = []
  const visit = (
    merged: MergedOperator,
    parentPath: string | null,
    siblings: MergedOperator[],
    depth: number,
    isLast: boolean,
    treePrefix: string
  ) => {
    let path = ''
    if (parentPath !== null) path = parentPath ? `${parentPath}/${merged.index}` : `${merged.index}`
    const sharesIndex = siblings.filter((item) => item.index === merged.index).length > 1
    const linePrefix = depth > 0 ? `${treePrefix}${isLast ? '└─ ' : '├─ '}` : ''

    result.push({
      key: `${slot.id}/${path}${sharesIndex ? `~${merged.name}` : ''}`,
      path,
      depth,
      name: merged.name,
      param: merged.param,
      step: `${linePrefix}${merged.name}`,
      byNode: merged.byNode,
    })

    let childPrefix = ''
    if (depth > 0) childPrefix = `${treePrefix}${isLast ? '   ' : '│  '}`
    const children = [...merged.children].sort((a, b) => a.index - b.index)
    children.forEach((child, position) => {
      visit(child, path, children, depth + 1, position === children.length - 1, childPrefix)
    })
  }
  visit(root, null, [root], 0, true, '')
  return result
}

// Compact key-metrics bar: neutral fill, and only the slowest operator (100%) is flagged.
export const keyBarColor = (percentage: number): string => {
  return percentage >= 100 ? 'var(--gpt-danger)' : 'var(--gpt-brand-700)'
}
