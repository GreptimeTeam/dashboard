import { ref, watch, type Ref } from 'vue'
import { useAppStore } from '@/store'
import type { DrilldownSignal } from './types'

export type SignalDbKind = DrilldownSignal

const STORAGE_PREFIX = 'signal-db'

/** One reactive ref per signal so Explorer and Query pages stay in sync. */
const sharedRefs = new Map<SignalDbKind, Ref<string>>()

function storageKey(kind: SignalDbKind): string {
  return `${STORAGE_PREFIX}:${kind}`
}

function globalFallback(): string {
  return useAppStore().database || 'public'
}

function readPersisted(kind: SignalDbKind): string {
  try {
    const raw = localStorage.getItem(storageKey(kind))
    if (typeof raw === 'string' && raw.trim()) {
      return raw.trim()
    }
  } catch {
    // ignore storage failures
  }
  return globalFallback()
}

/** Read the persisted DB for a signal; falls back to the global connection DB. */
export function getSignalDatabase(kind: SignalDbKind): string {
  const shared = sharedRefs.get(kind)
  if (shared?.value) {
    return shared.value
  }
  return readPersisted(kind)
}

/** Persist the DB preference for a signal. */
export function setSignalDatabase(kind: SignalDbKind, database: string): void {
  const next = database.trim()
  if (!next) {
    return
  }
  try {
    localStorage.setItem(storageKey(kind), next)
  } catch {
    // ignore storage failures
  }
  const shared = sharedRefs.get(kind)
  if (shared && shared.value !== next) {
    shared.value = next
  }
}

/**
 * Reactive per-signal database. Writes sync to localStorage so Explorer and classic
 * Query pages share the same preference. Repeated calls for the same kind return
 * the same ref.
 */
export function useSignalDatabase(kind: SignalDbKind): Ref<string> {
  const existing = sharedRefs.get(kind)
  if (existing) {
    return existing
  }

  const database = ref(readPersisted(kind))
  watch(database, (next) => {
    if (typeof next === 'string' && next.trim()) {
      try {
        localStorage.setItem(storageKey(kind), next.trim())
      } catch {
        // ignore storage failures
      }
    }
  })
  sharedRefs.set(kind, database)
  return database
}
