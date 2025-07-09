import { ref, watch, onUnmounted } from 'vue'
import { storeToRefs } from 'pinia'
import { useAppStore } from '@/store'

// 全局状态
const databasesLoading = ref(false)
const databasesError = ref<string | null>(null)
const lastFetchConfig = ref<{ host: string; database: string } | null>(null)

// 订阅者管理
const subscribers = new Set<
  (data: { databases: string[]; loading: boolean; error: string | null; currentDatabase: string; host: string }) => void
>()

// 事件总线
const eventBus = {
  // 发布数据更新
  publish() {
    const appStore = useAppStore()
    const data = {
      databases: appStore.databaseList,
      loading: databasesLoading.value,
      error: databasesError.value,
      currentDatabase: appStore.database,
      host: appStore.host,
    }
    subscribers.forEach((callback) => callback(data))
  },

  // 订阅数据更新
  subscribe(callback: (data: any) => void) {
    subscribers.add(callback)
    // 立即调用一次，让订阅者获取当前状态
    const appStore = useAppStore()
    callback({
      databases: appStore.databaseList,
      loading: databasesLoading.value,
      error: databasesError.value,
      currentDatabase: appStore.database,
      host: appStore.host,
    })

    // 返回取消订阅函数
    return () => subscribers.delete(callback)
  },
}

// 获取数据的方法
const fetchDatabases = async (force = false) => {
  const appStore = useAppStore()
  const { host, database } = storeToRefs(appStore)

  if (!host.value) {
    databasesError.value = 'Host is required'
    eventBus.publish()
    return
  }

  // 检查是否需要重新获取数据
  const currentConfig = { host: host.value as string, database: database.value as string }
  if (
    !force &&
    lastFetchConfig.value &&
    lastFetchConfig.value.host === currentConfig.host &&
    lastFetchConfig.value.database === currentConfig.database &&
    appStore.databaseList.length > 0
  ) {
    return // 配置没有变化且已有数据，不需要重新获取
  }

  databasesLoading.value = true
  databasesError.value = null
  eventBus.publish()

  try {
    // @ts-ignore
    const hasDB = await appStore.fetchDatabases()
    if (hasDB) {
      lastFetchConfig.value = currentConfig
    } else {
      databasesError.value = 'Failed to fetch databases'
      // 获取数据库失败时显示 global-setting
      // @ts-ignore
      appStore.updateSettings({ globalSettings: true })
    }
  } catch (error) {
    console.error('Failed to fetch databases:', error)
    databasesError.value = error instanceof Error ? error.message : 'Unknown error'
    // 获取数据库出错时显示 global-setting
    // @ts-ignore
    appStore.updateSettings({ globalSettings: true })
  } finally {
    databasesLoading.value = false
    eventBus.publish()
  }
}

// 监听配置变化
let configWatcher: (() => void) | null = null

const initConfigWatcher = () => {
  if (configWatcher) return

  const appStore = useAppStore()
  const { host, database } = storeToRefs(appStore)

  configWatcher = watch(
    [host, database],
    ([newHost, newDatabase], [oldHost, oldDatabase]) => {
      // 只有当配置真正改变时才重新获取数据
      if (newHost !== oldHost || newDatabase !== oldDatabase) {
        console.log('Database config changed, refetching...', { newHost, newDatabase })
        fetchDatabases(true)
      }
    },
    { deep: true }
  )
}

// 数据库相关的 hook
export function useDatabases() {
  // 本地响应式状态
  const localDatabases = ref<string[]>([])
  const localLoading = ref(false)
  const localError = ref<string | null>(null)
  const localCurrentDatabase = ref<string>('')
  const localHost = ref<string>('')

  let unsubscribe: (() => void) | null = null

  // 订阅全局状态变化
  const subscribe = () => {
    unsubscribe = eventBus.subscribe((data) => {
      localDatabases.value = data.databases
      localLoading.value = data.loading
      localError.value = data.error
      localCurrentDatabase.value = data.currentDatabase
      localHost.value = data.host
    })
  }

  // 取消订阅
  const cleanup = () => {
    unsubscribe?.()
  }

  // 刷新数据
  const refresh = () => {
    fetchDatabases(true)
  }

  // 初始化
  const initialize = () => {
    // 初始化配置监听
    initConfigWatcher()

    // 如果没有数据则获取
    const appStore = useAppStore()
    if (appStore.databaseList.length === 0 && !databasesLoading.value) {
      fetchDatabases()
    }
  }

  // 自动清理
  onUnmounted(() => {
    cleanup()
  })

  return {
    databases: localDatabases,
    databasesLoading: localLoading,
    databasesError: localError,
    currentDatabase: localCurrentDatabase,
    host: localHost,
    refresh,
    subscribe,
    cleanup,
    initialize,
  }
}

// 导出用于手动调用的方法
export { fetchDatabases, eventBus }
