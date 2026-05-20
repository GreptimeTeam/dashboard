export interface ResultInLog {
  type: string
  rowCount: number
}

export interface Log {
  sql?: string
  error?: string
  name?: string
  type: string
  promInfo?: object
  codeInfo: string
  codeTooltip?: string
  message: string
  startTime?: string
  networkTime?: number
}
