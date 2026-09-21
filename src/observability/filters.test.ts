import { describe, expect, it } from 'vitest'
import { normalizeEntityFilters } from './entity-keys'
import {
  addFilter,
  buildPromMatchersString,
  filterOpsForType,
  filterAppliesToSignal,
  filterIncludesValue,
  filtersToSqlWhere,
  hasLogsMappedFilters,
  isValidFilterValue,
  normalizeFilterOp,
  resolveFieldMapColumn,
  toggleIncludeFilter,
} from './filters'

describe('typed filter literals (traces attribute columns)', () => {
  const typeOf = (column: string) => ({ duration: 'UInt64', flags: 'Boolean', code: 'UInt32', name: 'String' }[column])
  const fieldMap = { duration: 'duration', flags: 'flags', code: 'code', name: 'name' }

  it('offers comparison ops for numbers, =/!= for booleans, regex ops for strings', () => {
    expect(filterOpsForType('UInt64')).toEqual(['=', '!=', '>', '>=', '<', '<='])
    expect(filterOpsForType('Boolean')).toEqual(['=', '!='])
    expect(filterOpsForType('String')).toEqual(['=', '!=', '=~', '!~'])
    expect(filterOpsForType(undefined)).toEqual(['=', '!=', '=~', '!~'])
    expect(normalizeFilterOp('String', '>')).toBe('=')
    expect(normalizeFilterOp('UInt64', '>')).toBe('>')
  })

  it('validates numeric and boolean inputs', () => {
    expect(isValidFilterValue('UInt64', '1000000000')).toBe(true)
    expect(isValidFilterValue('UInt64', '1s')).toBe(false)
    expect(isValidFilterValue('Boolean', 'true')).toBe(true)
    expect(isValidFilterValue('Boolean', 'TRUE')).toBe(true)
    expect(isValidFilterValue('Boolean', 'yes')).toBe(false)
    expect(isValidFilterValue('String', 'anything')).toBe(true)
  })

  it('renders unquoted numeric / TRUE-FALSE literals and drops invalid ones', () => {
    expect(
      filtersToSqlWhere(
        [
          { key: 'duration', op: '>', value: '1000000000' },
          { key: 'flags', op: '=', value: 'true' },
          { key: 'code', op: '=', value: '200' },
        ],
        fieldMap,
        { typeOf }
      )
    ).toEqual([`"duration" > 1000000000`, `"flags" = TRUE`, `"code" = 200`])

    // A comparison or a non-numeric value on a numeric column never becomes broken SQL.
    expect(filtersToSqlWhere([{ key: 'code', op: '>', value: 'abc' }], fieldMap, { typeOf })).toEqual([])
    expect(filtersToSqlWhere([{ key: 'name', op: '>', value: 'abc' }], fieldMap, { typeOf })).toEqual([])
    // Booleans reject the quoted-string reading GreptimeDB fails to plan (Boolean = Utf8).
    expect(filtersToSqlWhere([{ key: 'flags', op: '=', value: 'yes' }], fieldMap, { typeOf })).toEqual([])
  })

  it('keeps string rendering unchanged when no type is known', () => {
    expect(filtersToSqlWhere([{ key: 'name', op: '=', value: 'abc' }], fieldMap)).toEqual([`"name" = 'abc'`])
  })

  it('keeps logs contains semantics: body =~ becomes LIKE on the physical column', () => {
    expect(
      filtersToSqlWhere([{ key: 'body', op: '=~', value: 'GET /api' }], { body: 'body' }, { containsColumns: ['body'] })
    ).toEqual([`"body" LIKE '%GET /api%' ESCAPE '\\'`])
  })
})

describe('filters fieldMap SQL mapping', () => {
  const fieldMap = {
    service: 'service_name',
    trace_id: 'trace_id',
    body: 'body',
    env: 'env',
  }

  it('resolveFieldMapColumn only returns mapped columns', () => {
    expect(resolveFieldMapColumn('service', fieldMap)).toBe('service_name')
    expect(resolveFieldMapColumn('instance', fieldMap)).toBeUndefined()
    expect(resolveFieldMapColumn('trace_id', fieldMap)).toBe('trace_id')
  })

  it('filtersToSqlWhere skips unmapped Prom-only labels', () => {
    const parts = filtersToSqlWhere(
      [
        { key: 'instance', op: '=', value: 'i-2' },
        { key: 'service', op: '=', value: 'checkout' },
        { key: 'env', op: '=~', value: 'prod.*' },
      ],
      fieldMap
    )
    expect(parts).toEqual([`"service_name" = 'checkout'`, `"env" ~ 'prod.*'`])
  })

  it('filtersToSqlWhere returns empty when nothing maps', () => {
    expect(filtersToSqlWhere([{ key: 'instance', op: '=', value: 'i-2' }], fieldMap)).toEqual([])
  })

  it('hasLogsMappedFilters requires table and mappable filters', () => {
    expect(hasLogsMappedFilters([{ key: 'service', op: '=', value: 'checkout' }], fieldMap)).toBe(false)
    expect(hasLogsMappedFilters([{ key: 'service', op: '=', value: 'checkout' }], fieldMap, 'otel_logs')).toBe(true)
    expect(hasLogsMappedFilters([{ key: 'instance', op: '=', value: 'i-2' }], fieldMap, 'otel_logs')).toBe(false)
  })

  it('filtersToSqlWhere ORs same-key multi-value as IN', () => {
    const filters = addFilter([{ key: 'service', op: '=', value: 'checkout' }], {
      key: 'service',
      op: '=',
      value: 'payments',
    })
    expect(filtersToSqlWhere(filters, fieldMap)).toEqual([`"service_name" IN ('checkout', 'payments')`])
  })

  it('filtersToSqlWhere emits json_get_string for JSON attribute chips', () => {
    const parts = filtersToSqlWhere([{ key: 'log_attributes.gen_ai.system', op: '=', value: 'openai' }], fieldMap)
    expect(parts).toEqual([`json_get_string("log_attributes", '$."gen_ai.system"') = 'openai'`])
  })

  it('filtersToSqlWhere treats unknown severity as null or empty', () => {
    expect(
      filtersToSqlWhere([{ key: 'level', op: '=', value: 'unknown' }], { level: 'level', severity: 'level' })
    ).toEqual([`("level" IS NULL OR "level" = '')`])
    const mixed = addFilter([{ key: 'level', op: '=', value: 'error' }], { key: 'level', op: '=', value: 'unknown' })
    expect(filtersToSqlWhere(mixed, { level: 'level', severity: 'level' })).toEqual([
      `("level" = 'error' OR ("level" IS NULL OR "level" = ''))`,
    ])
  })

  it('filtersToSqlWhere contains-matches the resolved body column on =~', () => {
    expect(filtersToSqlWhere([{ key: 'body', op: '=~', value: 'timeout' }], { body: 'message' })).toEqual([
      `"message" LIKE '%timeout%' ESCAPE '\\'`,
    ])
    expect(
      filtersToSqlWhere([{ key: 'note', op: '=~', value: 'timeout' }], { note: 'message', body: 'payload_text' })
    ).toEqual([`"message" ~ 'timeout'`])
    expect(filtersToSqlWhere([{ key: 'body', op: '=', value: 'exact' }], { body: 'message' })).toEqual([
      `"message" = 'exact'`,
    ])
    expect(
      filtersToSqlWhere(
        [{ key: 'err', op: '=~', value: 'timeout' }],
        { err: 'err', body: 'body' },
        {
          containsColumns: ['err', 'body'],
        }
      )
    ).toEqual([`"err" LIKE '%timeout%' ESCAPE '\\'`])
  })

  it('filtersToSqlWhere uses knownJsonColumns for custom Json containers', () => {
    const parts = filtersToSqlWhere([{ key: 'payload.region', op: '=', value: 'us' }], fieldMap, {
      jsonColumns: ['payload'],
    })
    expect(parts).toEqual([`json_get_string("payload", '$."region"') = 'us'`])
  })
})

describe('same-key OR merge', () => {
  it('addFilter merges same-key includes into =~', () => {
    const filters = addFilter(addFilter([], { key: 'service', op: '=', value: 'a' }), {
      key: 'service',
      op: '=',
      value: 'b',
    })
    expect(filters).toEqual([{ key: 'service', op: '=~', value: 'a|b' }])
  })

  it('addFilter keeps different keys as AND list', () => {
    const filters = addFilter(addFilter([], { key: 'service', op: '=', value: 'a' }), {
      key: 'env',
      op: '=',
      value: 'prod',
    })
    expect(filters).toEqual([
      { key: 'service', op: '=', value: 'a' },
      { key: 'env', op: '=', value: 'prod' },
    ])
  })

  it('toggleIncludeFilter removes an included value', () => {
    const merged = addFilter(addFilter([], { key: 'service', op: '=', value: 'a' }), {
      key: 'service',
      op: '=',
      value: 'b',
    })
    expect(toggleIncludeFilter(merged, { key: 'service', op: '=', value: 'a' })).toEqual([
      { key: 'service', op: '=', value: 'b' },
    ])
  })

  it('filterIncludesValue reads merged =~ chip', () => {
    const filters = addFilter(addFilter([], { key: 'service', op: '=', value: 'a' }), {
      key: 'service',
      op: '=',
      value: 'b',
    })
    expect(filterIncludesValue(filters, 'service', 'a')).toBe(true)
    expect(filterIncludesValue(filters, 'service', 'c')).toBe(false)
  })

  it('buildPromMatchersString emits =~ for multi-value', () => {
    const filters = addFilter(addFilter([], { key: 'job', op: '=', value: 'api' }), {
      key: 'job',
      op: '=',
      value: 'worker',
    })
    expect(buildPromMatchersString(filters)).toBe('job=~"api|worker"')
  })

  it('maps the canonical service entity onto the metrics label', () => {
    // `service` is the shared entity key; metrics carries the bare service in
    // `service_name` (`job` is namespace-qualified, so its value would not match).
    expect(buildPromMatchersString([{ key: 'service', op: '=', value: 'checkout' }])).toBe('service_name="checkout"')
    // A lone physical alias is left alone: a metric table may carry service_name without job.
    expect(buildPromMatchersString([{ key: 'service_name', op: '=', value: 'checkout' }])).toBe(
      'service_name="checkout"'
    )
  })

  it('collapses alias duplicates of the same entity instead of ANDing two labels', () => {
    expect(
      buildPromMatchersString([
        { key: 'service_name', op: '=', value: 'checkout' },
        { key: 'job', op: '=', value: 'checkout' },
      ])
    ).toBe('service_name="checkout"')
  })
})

describe('entity filter keys across signals', () => {
  it('re-keys a service filter into the target signal vocabulary', () => {
    const metricsFilter = [{ key: 'job', op: '=' as const, value: 'checkout' }]
    // logs/traces resolve the entity through their field map role, not the physical name.
    expect(normalizeEntityFilters(metricsFilter, 'logs')).toEqual([{ key: 'service', op: '=', value: 'checkout' }])
    expect(normalizeEntityFilters(metricsFilter, 'traces')).toEqual([{ key: 'service', op: '=', value: 'checkout' }])

    const logsFilter = [{ key: 'service', op: '=' as const, value: 'checkout' }]
    expect(normalizeEntityFilters(logsFilter, 'metrics')).toEqual([{ key: 'service_name', op: '=', value: 'checkout' }])
    // Idempotent.
    expect(normalizeEntityFilters(normalizeEntityFilters(logsFilter, 'metrics'), 'metrics')).toEqual([
      { key: 'service_name', op: '=', value: 'checkout' },
    ])
  })

  it('leaves non-entity filters untouched', () => {
    const filters = [
      { key: 'span_name', op: '=' as const, value: 'GET /cart' },
      { key: 'severity_text', op: '!=' as const, value: 'DEBUG' },
    ]
    expect(normalizeEntityFilters(filters, 'logs')).toEqual(filters)
  })

  it('prefers the key resolved from the bound table over the signal default', () => {
    // logs binds a table whose service lives in resource_attributes JSON, so the metric
    // filter re-keys to a chip instead of the `service` role (filters support chips).
    expect(
      normalizeEntityFilters(
        [{ key: 'service_name', op: '=', value: 'frontend' }],
        'logs',
        () => 'resource_attributes.service.name'
      )
    ).toEqual([{ key: 'resource_attributes.service.name', op: '=', value: 'frontend' }])

    // Without a resolved key the fallback still applies.
    expect(normalizeEntityFilters([{ key: 'service_name', op: '=', value: 'frontend' }], 'logs')).toEqual([
      { key: 'service', op: '=', value: 'frontend' },
    ])
  })
})

describe('filterAppliesToSignal', () => {
  const filter = (key: string) => ({ key, op: '=' as const, value: 'v' })

  it('always applies on metrics (labels are per metric table)', () => {
    expect(filterAppliesToSignal(filter('container_name'), 'metrics')).toBe(true)
  })

  it('keeps everything until the signal table is bound', () => {
    expect(filterAppliesToSignal(filter('container_name'), 'traces')).toBe(true)
    expect(filterAppliesToSignal(filter('container_name'), 'traces', { columns: [] })).toBe(true)
  })

  it('drops keys the bound table does not have', () => {
    // `container_name` is a metric label; the trace table has no such column.
    expect(filterAppliesToSignal(filter('container_name'), 'traces', { columns: ['trace_id', 'service_name'] })).toBe(
      false
    )
    expect(filterAppliesToSignal(filter('trace_id'), 'traces', { columns: ['trace_id'] })).toBe(true)
    // Flattened attribute columns are real columns on trace tables.
    expect(
      filterAppliesToSignal(filter('resource_attributes.container.id'), 'traces', {
        columns: ['resource_attributes.container.id'],
      })
    ).toBe(true)
  })

  it('accepts a JSON attribute chip when its container column exists', () => {
    expect(
      filterAppliesToSignal(filter('resource_attributes.service.name'), 'logs', {
        columns: ['resource_attributes', 'timestamp'],
      })
    ).toBe(true)
    expect(filterAppliesToSignal(filter('log_attributes.http.status_code'), 'logs', { columns: ['timestamp'] })).toBe(
      false
    )
  })
})
