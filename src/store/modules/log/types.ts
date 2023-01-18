export interface logType {
  result?: string
  sql?: string
  error?: string
  name?: string
}

export interface logsType {
  [key: string]: logType[]
}
