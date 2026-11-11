import { effectScope, ref, watch, type Ref } from 'vue'
import { useAppStore } from '@/store'
import { hostMatches, readRaw, writeJSON } from '@/utils/storage'
import type { DrilldownSignal } from './types'

export type SignalDbKind = DrilldownSignal

/**
 * Database for the currently bound logs/traces table. Prefers `semantics.*.database`
 * (set by the binder, including Trace→Logs overlay) over the page preference
 * `connection.{logs|traces}Database`.
 */
export function boundSignalDatabase(
  ctx: {
    semantics: {
      logs: { database: { value: string | undefined } }
      traces: { database: { value: string | undefined } }
    }
    connection: { databaseFor: (signal: 'logs' | 'traces') => string }
  },
  kind: 'logs' | 'traces'
): string {
  return ctx.semantics[kind].database.value || ctx.connection.databaseFor(kind)
}

const STORAGE_PREFIX = 'signal-db'
const STORAGE_VERSION = 1

/** Persisted shape: the host is stored alongside the DB so a connection switch invalidates it. */
interface StoredSignalDatabase {
  v?: number
  host?: string
  database?: string
}

/** One reactive ref per signal so Explorer and Query pages stay in sync. */
const sharedRefs = new Map<SignalDbKind, Ref<string>>()
let prefsScope = effectScope(true)

function storageKey(kind: SignalDbKind): string {
  return `${STORAGE_PREFIX}:${kind}`
}

function currentHost(): string {
  return useAppStore().host || ''
}

/** The app-wide DB, falling back to the first available DB when it no longer exists. */
function fallbackDatabase(): string {
  const app = useAppStore()
  const list = app.databaseList || []
  if (list.length) {
    return list.includes(app.database) ? app.database : list[0]
  }
  return app.database || 'public'
}

function validDatabase(database: string): string {
  const trimmed = database.trim()
  if (!trimmed) {
    return fallbackDatabase()
  }
  const list = useAppStore().databaseList || []
  if (list.length && !list.includes(trimmed)) {
    return fallbackDatabase()
  }
  return trimmed
}

function readPersisted(kind: SignalDbKind): string {
  const raw = readRaw(storageKey(kind))
  if (!raw) {
    return fallbackDatabase()
  }

  const trimmed = raw.trim()
  // Legacy format: the DB name was stored as a plain string. Adopt it once; the next
  // write upgrades it to the stamped shape.
  if (!trimmed.startsWith('{')) {
    return validDatabase(trimmed)
  }

  try {
    const parsed = JSON.parse(trimmed) as StoredSignalDatabase
    if (!parsed || typeof parsed !== 'object' || typeof parsed.database !== 'string') {
      return fallbackDatabase()
    }
    if (!hostMatches(parsed.host, currentHost())) {
      return fallbackDatabase()
    }
    return validDatabase(parsed.database)
  } catch {
    return fallbackDatabase()
  }
}

/** Read the persisted DB for a signal; falls back to the global connection DB. */
export function getSignalDatabase(kind: SignalDbKind): string {
  const shared = sharedRefs.get(kind)
  if (shared?.value) {
    return validDatabase(shared.value)
  }
  return readPersisted(kind)
}

/** Persist the DB preference for a signal. */
export function setSignalDatabase(kind: SignalDbKind, database: string): void {
  const next = database.trim()
  if (!next) {
    return
  }
  writeJSON(storageKey(kind), {
    v: STORAGE_VERSION,
    host: currentHost(),
    database: next,
  })
  const shared = sharedRefs.get(kind)
  if (shared && shared.value !== next) {
    shared.value = next
  }
}

/**
 * Reactive per-signal database. Writes sync to localStorage so Explorer and classic
 * Query pages share the same preference. Repeated calls for the same kind return
 * the same ref.
 *
 * The stored value carries the host it was chosen on. When the connection changes,
 * or the DB no longer exists on this server, the ref falls back to the app-wide DB.
 */
export function useSignalDatabase(kind: SignalDbKind): Ref<string> {
  const existing = sharedRefs.get(kind)
  if (existing) {
    return existing
  }

  const database = ref(readPersisted(kind))
  const app = useAppStore()
  // Detached: the ref outlives whichever component asked first, so must its persistence.
  prefsScope.run(() => {
    watch(database, (next) => {
      if (typeof next === 'string' && next.trim()) {
        writeJSON(storageKey(kind), {
          v: STORAGE_VERSION,
          host: currentHost(),
          database: next.trim(),
        })
      }
    })
    // A different host or a refreshed database list may invalidate the stored DB.
    watch([() => app.host, () => app.databaseList], () => {
      const next = readPersisted(kind)
      if (next !== database.value) {
        database.value = next
      }
    })
  })
  sharedRefs.set(kind, database)
  return database
}

/** Test hook: drop the shared refs and their watchers. */
export function resetSignalDatabasesForTests(): void {
  prefsScope.stop()
  prefsScope = effectScope(true)
  sharedRefs.clear()
}
