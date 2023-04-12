import { Log } from '@/store/modules/log/types'
import { setup } from 'mockjs'

export default function useLog() {
  const route = useRoute()
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
