// Common types
export type Span = Record<string, any>

// Utility functions
export function formatTime(timestamp: number) {
  const ms = timestamp / 1_000_000
  return new Date(ms).toISOString()
}

export function formatDuration(duration: number) {
  const ms = duration / 1_000_000 // Convert nanoseconds to milliseconds
  return `${ms.toFixed(2)}ms`
}

export function buildSpanTree(spans: Span[]): Span[] {
  const spanMap = new Map<string, Span>()
  const tree: Span[] = []

  // First pass: create a map of all spans by their ID
  spans.forEach((span) => {
    spanMap.set(span.span_id, { ...span, children: [], _level: 0, key: span.span_id, title: span.span_name })
  })

  // Second pass: build the tree structure
  spans.forEach((span) => {
    const spanWithChildren = spanMap.get(span.span_id)!
    if (!span.parent_span_id) {
      // This is a root span
      tree.push(spanWithChildren)
    } else {
      // This is a child span
      const parentSpan = spanMap.get(span.parent_span_id)
      if (parentSpan) {
        parentSpan.children = parentSpan.children || []
        parentSpan.children.push(spanWithChildren)
      } else {
        // Parent not found, treat as root
        tree.push(spanWithChildren)
      }
    }
  })

  // Calculate absolute levels for all nodes
  function calculateLevels(node: Span, level: number) {
    node._level = level
    if (node.children && node.children.length > 0) {
      node.children.forEach((child) => calculateLevels(child, level + 1))
    }
  }

  // Start level calculation from root nodes
  tree.forEach((node) => calculateLevels(node, 0))

  // Sort children by start time
  function sortChildren(node: Span) {
    if (node.children && node.children.length > 0) {
      node.children.sort((a, b) => {
        const timeA = a.start_time || a.timestamp
        const timeB = b.start_time || b.timestamp
        return timeA - timeB
      })
      node.children.forEach(sortChildren)
    }
  }

  tree.forEach(sortChildren)
  return tree
}

export function getRelativePosition(span: Span, startTime: number, endTime: number): number {
  console.log(span.timestamp, startTime, endTime)
  if (!startTime || !endTime) return 0
  const spanTime = span.timestamp
  return ((spanTime - startTime) / (endTime - startTime)) * 100
}

export function getDurationWidth(span: Span, startTime: number, endTime: number): number {
  if (!startTime || !endTime) return 0
  return (span.duration_nano / (endTime - startTime)) * 100
}

export function processSpanData(records: {
  schema: { column_schemas: Array<{ name: string; data_type: string }> }
  rows: any[][]
}): Span[] {
  // Create a map of column names to their indices
  const columnMap = records.schema.column_schemas.reduce((acc, col, index) => {
    acc[col.name] = index
    return acc
  }, {} as Record<string, number>)

  return records.rows.map((row: any[]) => {
    const span: Span = {}
    records.schema.column_schemas.forEach((col) => {
      const value = row[columnMap[col.name]]
      // Handle special cases for certain columns
      if (col.name === 'attributes' && value) {
        span[col.name] = JSON.parse(value)
      } else if (col.name === 'timestamp') {
        span[col.name] = Number(value)
      } else {
        span[col.name] = value
      }
    })
    return span
  })
}
