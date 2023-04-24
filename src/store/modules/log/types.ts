export interface Log {
  results?: ResultInLog[]
  sql?: string
  error?: string
  name?: string
  type: string
  promInfo?: {}
  codeInfo: string
}

export interface ResultInLog {}
