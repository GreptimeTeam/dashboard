import { useStorage } from '@vueuse/core'
import axios from 'axios'
import { isTauri } from '@tauri-apps/api/core'
import defaultSettings from '@/config/settings.json'
import editorAPI from '@/api/editor'
import { setDashboardTimezone } from '@/utils/timezone'
import { writeJSON } from '@/utils/storage'
import type { Ref } from 'vue'
import type { AppState, ConnectionConfig, DbConnectionStatus, StoredConfig, UiConfig } from './types'
import { applyUrlInfoToConfig, consumeUrlInfo } from './consume-url-info'

const useAppStore = defineStore('app', () => {
  // Persistent storage — declared first so state refs can use stored values as defaults
  const configStorage = useStorage<Partial<StoredConfig>>('config', {}, localStorage)
  const uiConfigStorage = useStorage<Partial<UiConfig>>('uiConfig', {}, localStorage)

  // One-time cleanup of UI keys that moved into `uiConfig` or are no longer persisted.
  {
    const ui = uiConfigStorage.value as Record<string, unknown>
    let changed = false
    if ('menuSelectedKey' in ui) {
      delete ui.menuSelectedKey
      changed = true
    }
    if (ui.compactRows === undefined) {
      try {
        const legacy = localStorage.getItem('query-table-compact-rows')
        if (legacy !== null) {
          ui.compactRows = legacy === 'true'
          changed = true
          localStorage.removeItem('query-table-compact-rows')
        }
      } catch {
        // ignore storage failures
      }
    }
    // These used to be standalone keys. Read them once so existing profiles keep
    // their layout; the REMOVED_STORAGE_KEYS pass below deletes the old keys.
    const legacyUiPrefs: Array<{ field: keyof UiConfig; legacyKey: string; kind: 'number' | 'boolean' }> = [
      { field: 'querySidebarWidth', legacyKey: 'sidebarWidth', kind: 'number' },
      { field: 'metricsSidebarWidth', legacyKey: 'metrics-sidebar-width', kind: 'number' },
      { field: 'persesSidebarWidth', legacyKey: 'perses-sidebar-width', kind: 'number' },
      {
        field: 'drilldownMetricsSidebarWidth',
        legacyKey: 'drilldown-metrics-sidebar-width',
        kind: 'number',
      },
      { field: 'queryEditorHeight', legacyKey: 'queryEditorHeight', kind: 'number' },
      { field: 'logQueryChartExpanded', legacyKey: 'logquery-chart-expanded', kind: 'boolean' },
      { field: 'traceChartExpanded', legacyKey: 'trace-chart-expanded', kind: 'boolean' },
      {
        field: 'persesSkillAlertDismissed',
        legacyKey: 'perses-skill-alert-dismissed',
        kind: 'boolean',
      },
    ]
    legacyUiPrefs.forEach(({ field, legacyKey, kind }) => {
      if (ui[field] !== undefined) return
      try {
        const raw = localStorage.getItem(legacyKey)
        if (raw === null) return
        const value = JSON.parse(raw)
        if (kind === 'number' && typeof value === 'number') {
          ui[field] = value
          changed = true
        } else if (kind === 'boolean' && typeof value === 'boolean') {
          ui[field] = value
          changed = true
        }
      } catch {
        // ignore malformed legacy values
      }
    })
    if (typeof ui.locale === 'string' && !['en-US', 'zh-CN', 'ja-JP'].includes(ui.locale)) {
      delete ui.locale
      changed = true
    }
    if (ui.locale === undefined) {
      try {
        const legacy = localStorage.getItem('greptime-locale')
        if (legacy) {
          ui.locale = legacy
          changed = true
          localStorage.removeItem('greptime-locale')
        }
      } catch {
        // ignore storage failures
      }
    }
    if (changed) {
      uiConfigStorage.value = { ...ui } as Partial<UiConfig>
      // Write through synchronously: initLocale reads the raw value before the
      // useStorage watcher flushes, and by then the legacy locale key is gone.
      writeJSON('uiConfig', uiConfigStorage.value)
    }
  }

  // Keys whose owners moved into uiConfig or sessionStorage, or which are no longer used.
  // Removing them once keeps existing browser profiles from carrying dead state forever.
  const REMOVED_STORAGE_KEYS = [
    'greptime-locale',
    'query-table-compact-rows',
    'queryEditorHeight',
    'sidebarWidth',
    'metrics-sidebar-width',
    'perses-sidebar-width',
    'drilldown-metrics-sidebar-width',
    'logquery-chart-expanded',
    'trace-chart-expanded',
    'perses-skill-alert-dismissed',
    'trace-displayed-columns',
    'drilldown-logs-table-column-visible',
    'drilldown-logs-table-column-offered',
    'logquery-table-column-visible',
    'logquery-table-column-offered',
    'logs-query-table-filters-cleared',
    'traces-query-table-filters-cleared',
    'sql-builder-last-table-quick-filters',
    'sql-builder-last-table-filters-cleared',
    'greptime_news_cache',
    'greptime_anon_id',
    'contact_form_last_submission',
    'drilldown-recent-metrics',
  ]
  REMOVED_STORAGE_KEYS.forEach((key) => {
    try {
      localStorage.removeItem(key)
    } catch {
      // ignore storage failures
    }
  })

  // Apply URL-injected config once at startup (search or hash query; e.g. cloud / shared links)
  {
    const { pathname, search, hash } = window.location
    const { info, nextUrl } = consumeUrlInfo(pathname, search, hash)
    if (info) {
      configStorage.value = applyUrlInfoToConfig(configStorage.value, info)
      if (nextUrl !== `${pathname}${search}${hash}`) {
        window.history.replaceState(null, '', nextUrl)
      }
    }
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
  const menuSelectedKey = ref(defaultSettings.menuSelectedKey)
  const hideSidebar = ref(ui.hideSidebar ?? defaultSettings.hideSidebar)

  // Runtime-only state (not persisted)
  const globalSettings = ref(defaultSettings.globalSettings)
  const databaseList = ref<string[]>(defaultSettings.databaseList)
  const guideModalVisible = ref(defaultSettings.guideModalVisible)
  const dbConnectionStatus = ref<DbConnectionStatus>('unknown')

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
    'locale',
    'compactRows',
    'querySidebarWidth',
    'metricsSidebarWidth',
    'persesSidebarWidth',
    'drilldownMetricsSidebarWidth',
    'queryEditorHeight',
    'logQueryChartExpanded',
    'traceChartExpanded',
    'persesSkillAlertDismissed',
    'logsTableSingleColumn',
    'logsTableShowKeys',
    'logsTableCompactRows',
    'logsTableWrapLines',
    'logsTableHiddenColumns',
    'traceTableHiddenColumns',
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

  // Sync flush so Save & Test uses the new host immediately (default watch is async).
  watch(
    host,
    (val) => {
      axios.defaults.baseURL = val
    },
    { immediate: true, flush: 'sync' }
  )
  watch(userTimezone, (val) => setDashboardTimezone(val), { immediate: true, flush: 'sync' })
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

  /** Result-table density, persisted with the rest of the UI preferences. */
  const compactRows = computed({
    get: () => uiConfigStorage.value.compactRows ?? false,
    set: (value: boolean) => saveUiConfig({ compactRows: value }),
  })

  /** Read a persisted UI preference. Reactive: it touches the storage ref. */
  const getUiConfigValue = <K extends keyof UiConfig>(key: K): UiConfig[K] | undefined => uiConfigStorage.value[key]

  const setUiConfigValue = <K extends keyof UiConfig>(key: K, value: UiConfig[K]): void => {
    saveUiConfig({ [key]: value } as Partial<UiConfig>)
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
    dbConnectionStatus.value = 'connecting'
    try {
      await editorAPI.runSQL(`select 1`)
      dbConnectionStatus.value = 'connected'
    } catch (error) {
      dbConnectionStatus.value = 'disconnected'
      throw error
    }
  }

  const checkDbConnection = async (): Promise<boolean> => {
    try {
      await validateConnection()
      return true
    } catch {
      return false
    }
  }

  const openGlobalSettings = () => {
    globalSettings.value = true
  }

  const closeGlobalSettings = () => {
    globalSettings.value = false
  }

  const validateAndSaveConnection = async (form: Partial<StoredConfig> = {}): Promise<boolean> => {
    const previousHost = host.value
    try {
      setConnectionConfig(form)
      await validateConnection()
      const { resetDataStatus } = useUserStore()
      resetDataStatus()
      saveConnectionConfig(form)
      // A host switch invalidates every in-memory binding (tables, field maps, schema
      // caches). Reload once so all of them are re-resolved against the new server.
      if (previousHost !== host.value && typeof window !== 'undefined') {
        window.setTimeout(() => window.location.reload(), 600)
      }
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
    dbConnectionStatus.value = 'connecting'
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

      dbConnectionStatus.value = 'connected'
      return true
    } catch (error) {
      databaseList.value = []
      dbConnectionStatus.value = 'disconnected'
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
    compactRows,
    dbId,
    lifetime,
    menuSelectedKey,
    userTimezone,
    hideSidebar,
    serviceName,
    regionVendor,
    regionLocation,
    regionCountry,
    dbConnectionStatus,

    // Actions
    applyUiConfig,
    getUiConfigValue,
    setUiConfigValue,
    ensureConnectionHost,
    validateAndSaveConnection,
    checkDbConnection,
    openGlobalSettings,
    closeGlobalSettings,
    refreshDatabaseList,
    tableCatalog,
    tableSchema,
  }
})

export default useAppStore
