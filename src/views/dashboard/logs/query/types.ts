export type ColumnType = {
  name: string
  data_type: string
  label: string
  semantic_type: string
}

export enum TimeTypes {
  SECOND = 'second',
  MILLISECOND = 'millisecond',
  MICROSECOND = 'microsecond',
  NANOSECOND = 'nanosecond',
}

export type TSColumn = {
  name: string
  data_type?: string
}
