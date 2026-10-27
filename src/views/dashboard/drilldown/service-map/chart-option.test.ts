import { describe, expect, it } from 'vitest'
import { aggregateNodeCallStats } from '@/observability/adapters/service-map/metrics'
import type { ServiceMapDisplayNode, ServiceMapEdge } from '@/observability/adapters/service-map/types'
import {
  buildServiceMapChartOption,
  buildServiceMapSeries,
  buildServiceMapTooltipFormatter,
  type ServiceMapChartInput,
} from './chart-option'
import { resolveServiceMapTheme } from './chart-theme'

function node(key: string, extra: Partial<ServiceMapDisplayNode> = {}): ServiceMapDisplayNode {
  return { key, label: key, type: 'service', virtual: false, ...extra }
}

function edge(source: string, target: string, values: Partial<ServiceMapEdge> = {}): ServiceMapEdge {
  return {
    key: `${source}\0${target}`,
    source,
    target,
    requests: 100,
    errors: 0,
    unmatched: 0,
    durationSum: 10,
    durationCount: 100,
    durationMax: 0.5,
    ...values,
  }
}

const theme = resolveServiceMapTheme((_name, value) => value, false)

function input(nodes: ServiceMapDisplayNode[], edges: ServiceMapEdge[]): ServiceMapChartInput {
  return {
    nodes,
    edges,
    layout: new Map(nodes.map((item, index) => [item.key, { x: index * 100, y: 0, community: 0 }])),
    stats: aggregateNodeCallStats(edges),
    trafficRange: { min: 0, max: 100 },
    theme,
    isDark: false,
    rangeSeconds: () => 10,
  }
}

const t = (key: string, named?: Record<string, unknown>) => (named ? `${key}:${JSON.stringify(named)}` : key)

describe('buildServiceMapSeries', () => {
  const nodes = [node('a'), node('b'), node('c'), node('db', { virtual: true, connectionType: 'database' })]
  const edges = [
    edge('a', 'b'),
    edge('b', 'c', { errors: 5 }),
    edge('c', 'db', { requests: 0, unmatched: 4, durationCount: 0, durationSum: 0 }),
  ]

  it('dims unrelated nodes and edges around the active node', () => {
    const resting = buildServiceMapSeries(input(nodes, edges))
    const { nodes: data, links } = buildServiceMapSeries(input(nodes, edges), 'b')
    const opacity = Object.fromEntries(data.map((item) => [item.id, item.itemStyle.opacity]))
    // Active + neighbors stay fully opaque; only the rest dims.
    expect(opacity).toEqual({ a: 1, b: 1, c: 1, db: 0.22 })
    expect(data.find((item) => item.id === 'b')?.label).toMatchObject({ fontSize: 13, fontWeight: 600, opacity: 1 })
    expect(links.map((item) => item.lineStyle.opacity)).toEqual([1, 1, 0.12])
    expect(links.slice(0, 2).every((item) => item.lineStyle.type === 'dashed' && item.lineStyle.width === 2.2)).toBe(
      true
    )
    // Node-hover flow must not rewrite edge geometry (curveness), or the path jumps.
    expect(links.map((item) => item.lineStyle.curveness)).toEqual(resting.links.map((item) => item.lineStyle.curveness))
  })

  it('renders the resting graph without any flow emphasis', () => {
    const { nodes: data, links } = buildServiceMapSeries(input(nodes, edges))
    expect(data.every((item) => item.itemStyle.opacity === 1)).toBe(true)
    expect(data[0].label).toMatchObject({ fontSize: 12, fontWeight: 500 })
    expect(links[0].lineStyle).toMatchObject({ type: 'solid', color: theme.edge })
    // ≥5% paired errors tint the edge; unmatched-only edges stay dashed in the external color.
    expect(links[1].lineStyle.color).toBe('rgba(239, 68, 68, 0.55)')
    expect(links[2].lineStyle).toMatchObject({ type: 'dashed', color: 'rgba(196, 120, 255, 0.65)', opacity: 0.5 })
  })

  it('draws real services as SVG glyphs and endpoints as dashed boxes', () => {
    const { nodes: data } = buildServiceMapSeries(input(nodes, edges))
    expect(String(data[0].symbol).startsWith('image://data:image/svg+xml')).toBe(true)
    expect(data[0].itemStyle).toMatchObject({ borderWidth: 0, color: 'transparent' })
    expect(data[3].symbol).toBe('roundRect')
    expect(data[3].itemStyle).toMatchObject({ borderType: 'dashed', borderColor: theme.database })
  })

  it('draws structural satellites and dashed structural edges', () => {
    const structuralNodes = [
      node('svc'),
      node('inst', { type: 'service.instance' }),
      node('ctr', { type: 'container' }),
    ]
    const structuralEdges = [
      edge('inst', 'svc', {
        key: 'inst\0svc\0part_of',
        relType: 'part_of',
        requests: 0,
        errors: 0,
        unmatched: 0,
        durationSum: 0,
        durationCount: 0,
      }),
      edge('inst', 'ctr', {
        key: 'inst\0ctr\0runs_on',
        relType: 'runs_on',
        requests: 0,
        errors: 0,
        unmatched: 0,
        durationSum: 0,
        durationCount: 0,
      }),
    ]
    const { nodes: data, links } = buildServiceMapSeries(input(structuralNodes, structuralEdges))
    const inst = data.find((item) => item.id === 'inst')
    const ctr = data.find((item) => item.id === 'ctr')
    expect(inst?.symbol).toBe('diamond')
    expect(ctr?.symbol).toBe('roundRect')
    expect(inst?.itemStyle).toMatchObject({ borderColor: theme.instance, borderType: 'dashed' })
    expect(ctr?.itemStyle).toMatchObject({ borderColor: theme.container, borderType: 'dashed' })
    expect(theme.instance).not.toBe(theme.container)
    expect(links.every((item) => item.lineStyle.type === 'dashed')).toBe(true)
    expect(links[0].lineStyle.color).toBe('rgba(90, 74, 112, 0.55)')
  })
})

describe('buildServiceMapChartOption', () => {
  it('is deterministic for the same input and never applies hover state', () => {
    const chartInput = input([node('a'), node('b')], [edge('a', 'b')])
    const first = buildServiceMapChartOption(chartInput, { t, labelFor: (key) => key })
    const second = buildServiceMapChartOption(chartInput, { t, labelFor: (key) => key })
    expect({ ...first, tooltip: undefined }).toEqual({ ...second, tooltip: undefined })
    expect(first.series[0].data).toEqual(buildServiceMapSeries(chartInput, '').nodes)
    expect(first.series[0]).toMatchObject({ type: 'graph', layout: 'none', emphasis: { focus: 'none' } })
  })
})

describe('buildServiceMapTooltipFormatter', () => {
  it('escapes labels and reports edge RED', () => {
    const chartInput = input([node('<a>'), node('b')], [edge('<a>', 'b', { errors: 10, unmatched: 3 })])
    const format = buildServiceMapTooltipFormatter(chartInput, { t, labelFor: (key) => key })
    const html = format({ dataType: 'edge', data: { edgeKey: '<a>\0b' } })
    expect(html).toContain('<strong>&lt;a&gt; → b</strong>')
    expect(html).toContain('drilldown.serviceMap.errorRate: 10%')
    expect(html).toContain('drilldown.serviceMap.unmatched: 3')
  })

  it('reports per-direction rates for service nodes', () => {
    const chartInput = input([node('a'), node('b')], [edge('a', 'b')])
    const format = buildServiceMapTooltipFormatter(chartInput, { t, labelFor: (key) => key })
    const html = format({ dataType: 'node', data: { nodeKey: 'b' } })
    expect(html).toContain('drilldown.serviceMap.incomingFlow')
    expect(html).toContain('drilldown.serviceMap.requestRate: 10 req/s')
    expect(format({ dataType: 'node', data: { nodeKey: 'missing' } })).toBe('')
  })

  it('labels structural edges and satellite nodes without RED', () => {
    const chartInput = input(
      [node('svc'), node('inst', { type: 'service.instance' })],
      [
        edge('inst', 'svc', {
          key: 'inst\0svc\0part_of',
          relType: 'part_of',
          requests: 0,
          errors: 0,
          unmatched: 0,
          durationSum: 0,
          durationCount: 0,
        }),
      ]
    )
    const format = buildServiceMapTooltipFormatter(chartInput, { t, labelFor: (key) => key })
    expect(format({ dataType: 'edge', data: { edgeKey: 'inst\0svc\0part_of' } })).toContain(
      'drilldown.serviceMap.relPartOf'
    )
    expect(format({ dataType: 'node', data: { nodeKey: 'inst' } })).toContain('drilldown.serviceMap.instanceNode')
  })
})
