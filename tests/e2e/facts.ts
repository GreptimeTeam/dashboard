/**
 * Facts about the existing (non-seeded) trace data, measured once by `global-setup` and handed to
 * the workers through the environment. Specs assert against these measured numbers, so they stay
 * correct whichever OpenTelemetry demo data the database holds.
 */
import { test } from '@playwright/test'

export type TraceFacts = {
  /** The trace with the most spans in the window (ties broken by trace id). */
  id: string
  spans: number
  services: string[]
  /** Rows of TRACES_LOGS_TABLE carrying this trace id inside the window. */
  logs: number
  /** Root spans (no parent) in the window. */
  roots: number
}

export const TRACE_FACTS_ENV = 'E2E_TRACE_FACTS'

/** `undefined` when the window holds no spans (tests depending on it skip). */
export function traceFacts(): TraceFacts | undefined {
  const raw = process.env[TRACE_FACTS_ENV]
  return raw ? (JSON.parse(raw) as TraceFacts) : undefined
}

/**
 * Skips with a reason. The reporter prints every skip reason in the summary line and the report
 * header, so "green" never silently means "nine tests verified nothing".
 */
export function requireData(reason: string): never {
  test.skip(true, reason)
  throw new Error(reason)
}

/** For use inside a test body: skips with a reason (printed by the reporter) when the window is empty. */
export function requireTraceFacts(reason: string): TraceFacts {
  const facts = traceFacts()
  return facts ?? requireData(reason)
}
