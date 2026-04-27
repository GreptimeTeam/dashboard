import { useStorage } from '@vueuse/core'
import axios from 'axios'
import { isTauri } from '@tauri-apps/api/core'
import defaultSettings from '@/config/settings.json'
import editorAPI from '@/api/editor'
import type { Ref } from 'vue'
import type { AppState, ConnectionConfig, StoredConfig, UiConfig } from './types'

const useAppStore = defineStore('app', () => {
  // Persistent storage — declared first so state refs can use stored values as defaults
  const configStorage = useStorage<Partial<StoredConfig>>('config', {}, localStorage)
  const uiConfigStorage = useStorage<Partial<UiConfig>>('uiConfig', {}, localStorage)

  // Apply URL-injected config once at startup (e.g. from cloud entry point)
  const urlParams = new URLSearchParams(window.location.search)
  const urlInfo = urlParams.get('info')
  if (urlInfo) {
    try {
      const urlConfig = JSON.parse(atob(urlInfo))
      configStorage.value = { ...configStorage.value, ...urlConfig }
    } catch {
      // ignore malformed info param
    }
    urlParams.delete('info')
    const cleanUrl = [window.location.pathname, urlParams.toString()].filter(Boolean).join('?')
    window.history.replaceState(null, '', cleanUrl)
  }

  const cfg = configStorage.value
  const ui = uiConfigStorage.value

  // Connection state — initialized from localStorage, falling back to defaults
  const host = ref(cfg.host ?? defaultSettings.host)
  const database = ref(cfg.database ?? defaultSettings.database)
  const username = ref(cfg.username ?? defaultSettings.username)
  const password = ref(cfg.password ?? defaultSettings.password)
  const authHeader = ref(cfg.authHeader ?? defaultSettings.authHeader)
  const userTimezone = ref(cfg.userTimezone ?? defaultSettings.userTimezone)
  const dbId = ref(cfg.dbId ?? defaultSettings.dbId)
  const lifetime = ref(cfg.lifetime ?? defaultSettings.lifetime)
  const serviceName = ref(cfg.serviceName ?? '')
  const regionVendor = ref(cfg.regionVendor ?? '')
  const regionLocation = ref(cfg.regionLocation ?? '')
  const regionCountry = ref(cfg.regionCountry ?? '')

  // UI state — initialized from localStorage, falling back to defaults
  const theme = ref(ui.theme ?? defaultSettings.theme)
  const navbar = ref(ui.navbar ?? defaultSettings.navbar)
  const device = ref(ui.device ?? defaultSettings.device)
  const hideMenu = ref(ui.hideMenu ?? defaultSettings.hideMenu)
  const menuCollapse = ref(ui.menuCollapse ?? defaultSettings.menuCollapse)
  const footer = ref(ui.footer ?? defaultSettings.footer)
  const menuWidth = ref(ui.menuWidth ?? defaultSettings.menuWidth)
  const menuSelectedKey = ref(ui.menuSelectedKey ?? defaultSettings.menuSelectedKey)
  const hideSidebar = ref(ui.hideSidebar ?? defaultSettings.hideSidebar)

  // Runtime-only state (not persisted)
  const globalSettings = ref(defaultSettings.globalSettings)
  const databaseList = ref<string[]>(defaultSettings.databaseList)
  const guideModalVisible = ref(defaultSettings.guideModalVisible)

  // Actions
  const stateRefs = {
    theme,
    device,
    hideMenu,
    host,
    database,
    username,
    password,
    authHeader,
    globalSettings,
    databaseList,
    menuCollapse,
    footer,
    menuWidth,
    guideModalVisible,
    dbId,
    lifetime,
    menuSelectedKey,
    userTimezone,
    hideSidebar,
    serviceName,
    regionVendor,
    regionLocation,
    regionCountry,
  }

  const patchAppState = (partial: Partial<AppState>) => {
    Object.entries(partial).forEach(([key, value]) => {
      if (value === undefined) return
      const target = stateRefs[key as keyof typeof stateRefs] as Ref<unknown> | undefined
      if (target) target.value = value
    })
  }

  const CONNECTION_KEYS = ['host', 'database', 'username', 'password', 'authHeader', 'userTimezone'] as const
  const CLOUD_KEYS = ['dbId', 'lifetime', 'serviceName', 'regionVendor', 'regionLocation', 'regionCountry'] as const
  const UI_KEYS = [
    'theme',
    'navbar',
    'hideMenu',
    'menuCollapse',
    'footer',
    'menuWidth',
    'device',
    'hideSidebar',
    'menuSelectedKey',
  ] as const

  const normalizeConnectionConfig = (config: Partial<StoredConfig>): Partial<StoredConfig> => {
    const normalized: Partial<StoredConfig> = {}
    CONNECTION_KEYS.forEach((key) => {
      if (config[key] !== undefined) normalized[key] = config[key] as any
    })
    CLOUD_KEYS.forEach((key) => {
      if (config[key]) normalized[key] = config[key] as any
    })
    if (normalized.authHeader === '') normalized.authHeader = defaultSettings.authHeader
    if (normalized.userTimezone) normalized.userTimezone = normalized.userTimezone.trim()
    return normalized
  }

  const normalizeUiConfig = (config: Partial<UiConfig>): Partial<UiConfig> => {
    const normalized: Partial<UiConfig> = {}
    UI_KEYS.forEach((key) => {
      if (config[key] !== undefined) (normalized as Record<string, unknown>)[key] = config[key]
    })
    return normalized
  }

  watch(
    host,
    (val) => {
      axios.defaults.baseURL = val
    },
    { immediate: true }
  )
  watch(
    theme,
    (val) => {
      if (val === 'dark') document.body.setAttribute('arco-theme', 'dark')
      else document.body.removeAttribute('arco-theme')
    },
    { immediate: true }
  )

  const saveConnectionConfig = (config: Partial<StoredConfig>) => {
    const normalized = normalizeConnectionConfig(config)
    patchAppState(normalized)
    configStorage.value = { ...configStorage.value, ...normalized }
  }

  const saveUiConfig = (config: Partial<UiConfig>) => {
    uiConfigStorage.value = { ...uiConfigStorage.value, ...normalizeUiConfig(config) }
  }

  const setConnectionConfig = (config: Partial<StoredConfig>) => {
    patchAppState(normalizeConnectionConfig(config))
  }

  const applyUiConfig = (config: Partial<UiConfig>, options: { persist?: boolean } = { persist: true }) => {
    const normalized = normalizeUiConfig(config)
    patchAppState(normalized)
    if (options.persist) saveUiConfig(normalized)
  }

  const ensureConnectionHost = async () => {
    if (host.value) return

    const tauriEnv = await isTauri()
    const inferredHost = tauriEnv
      ? 'http://localhost:4000'
      : (() => {
          const { origin, pathname } = window.location
          const index = pathname.lastIndexOf('/dashboard')
          return index !== -1 ? `${origin}${pathname.slice(0, index)}` : `${origin}${pathname}`
        })()

    saveConnectionConfig({ host: inferredHost })
  }

  const validateConnection = async () => {
    await editorAPI.runSQL(`select 1`)
  }

  const openGlobalSettings = () => {
    globalSettings.value = true
  }

  const closeGlobalSettings = () => {
    globalSettings.value = false
  }

  const validateAndSaveConnection = async (form: Partial<StoredConfig> = {}): Promise<boolean> => {
    try {
      setConnectionConfig(form)
      await validateConnection()
      const { resetDataStatus } = useUserStore()
      resetDataStatus()
      saveConnectionConfig(form)
      return true
    } catch (error) {
      const { resetData } = useDataBaseStore()
      resetData()
      openGlobalSettings()
      return false
    }
  }

  const refreshDatabaseList = async (overrideHost?: string): Promise<boolean> => {
    const prevBaseURL = axios.defaults.baseURL
    if (overrideHost) axios.defaults.baseURL = overrideHost
    try {
      const res: any = await editorAPI.getDatabases()

      const databases = res.output[0].records.rows.map((item: string[]) => item[0])
      databaseList.value = databases.sort((a: string, b: string) => {
        if (a === 'public') return -1
        if (b === 'public') return 1
        if (a === 'greptime_private' || a === 'information_schema') return 1
        if (b === 'greptime_private' || b === 'information_schema') return -1
        return 0
      })

      if (!databaseList.value.includes(database.value)) {
        database.value = databaseList.value[0]
      }

      const { databaseActiveKeys: keys } = storeToRefs(useDataBaseStore())
      keys.value = [database.value]
      saveConnectionConfig({ database: database.value })

      return true
    } catch (error) {
      openGlobalSettings()
      return false
    } finally {
      if (overrideHost) axios.defaults.baseURL = prevBaseURL
    }
  }

  const isDark = computed(() => theme.value === 'dark')

  const tableCatalog = computed(() => {
    return database.value.split('-').slice(0, -1).join('-') || 'greptime'
  })
  const tableSchema = computed(() => {
    return database.value.split('-').slice(-1).join('-')
  })

  return {
    // State
    isDark,
    navbar,
    device,
    host,
    database,
    username,
    password,
    authHeader,
    globalSettings,
    databaseList,
    guideModalVisible,
    menuCollapse,
    footer,
    dbId,
    lifetime,
    menuSelectedKey,
    userTimezone,
    hideSidebar,
    serviceName,
    regionVendor,
    regionLocation,
    regionCountry,

    // Actions
    applyUiConfig,
    ensureConnectionHost,
    validateAndSaveConnection,
    openGlobalSettings,
    closeGlobalSettings,
    refreshDatabaseList,
    tableCatalog,
    tableSchema,
  }
})

export default useAppStore
