import type { ColumnType, TSColumn } from '@/types/query'

export interface TableData {
  [key: string]: any
}

export type MergedPart = {
  key: string
  text: string
  isLink: boolean
}

export type LogsColumnMode = 'separate' | 'merged' | 'merged-with-keys'

export type ColumnWidthRule = { width?: number; minWidth?: number }

export type SeparateField = {
  field: string
  title: string
  /** Primary timestamp column: clickable, fixed width. */
  isTs: boolean
  /** Date-typed column: cell text is formatted before measuring. */
  isTime: boolean
  isLink: boolean
}

/** Inputs derived from component props shared by the pure table helpers. */
export interface LogsTableFieldsInput {
  columns: ColumnType[]
  displayedColumns: string[]
  tsColumn: TSColumn | null
  linkColumn: string
}
