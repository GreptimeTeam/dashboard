import { getPlaygroundInfo } from '@/api/playground'
import { Log } from '@/store/modules/log/types'

export default function useLog() {
  const route = useRoute()
  const { push, clear } = useLogStore()

  const pushLog = (log: Log, type: string) => {
    push(log, type || (route.name as string))
  }
  const clearLogs = () => {
    clear(route.name as string)
  }

  return {
    pushLog,
    clearLogs,
  }
}
