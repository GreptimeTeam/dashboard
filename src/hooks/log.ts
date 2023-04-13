import { Log } from '@/store/modules/log/types'

export default function useLog(route?: any) {
  const { push, clear } = useLogStore()

  const pushLog = (log: Log, type: string) => {
    push(log, type || (route?.name as string))
  }
  const clearLogs = (type = route?.name as string | string[]) => {
    clear(type)
  }

  return {
    pushLog,
    clearLogs,
  }
}
