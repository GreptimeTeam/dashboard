import { createContext, ReactNode, useContext, useMemo } from 'react'

export type PersesDashboardFile = {
  content: string
  filename: string
  meta?: {
    commit?: {
      author?: string
      email?: string
      id?: string
      message?: string
      time?: number
    }
  }
  isRenaming?: boolean
}

export type WorkbenchContextType = {
  database: string
  username: string
  password: string
  authHeader: string
  name: string
  file: PersesDashboardFile
  instance: string
  /** Dashboard timezone setting (`''` = browser). */
  timezone: string
}

type Props = {
  children?: ReactNode
  database: string
  username: string
  password: string
  authHeader: string
  name: string
  file: PersesDashboardFile
  instance: string
  timezone?: string
}

export const WorkbenchContext = createContext<WorkbenchContextType | undefined>(undefined)

export function WorkbenchProvider(props: Props) {
  const ctx: WorkbenchContextType = useMemo(
    () => ({
      database: props.database,
      username: props.username,
      password: props.password,
      authHeader: props.authHeader,
      name: props.name,
      file: props.file,
      instance: props.instance,
      timezone: props.timezone ?? '',
    }),
    [
      props.database,
      props.username,
      props.password,
      props.authHeader,
      props.name,
      props.file,
      props.instance,
      props.timezone,
    ]
  )

  return <WorkbenchContext.Provider value={ctx}>{props.children}</WorkbenchContext.Provider>
}

export function useWorkbenchContext() {
  const ctx = useContext(WorkbenchContext)
  if (ctx === undefined) {
    throw new Error('No WorkbenchContext found. Did you forget a Provider?')
  }
  return ctx
}
