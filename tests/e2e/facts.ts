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

/** For use inside a test body: skips the test when the window holds no spans. */
export function requireTraceFacts(reason: string): TraceFacts {
  const facts = traceFacts()
  if (!facts) {
    test.skip(true, reason)
    throw new Error(reason)
  }
  return facts
}
