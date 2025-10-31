import { useStorage } from '@vueuse/core'
import dayjs from 'dayjs'
import utc from 'dayjs/plugin/utc'
import timezone from 'dayjs/plugin/timezone'
import defaultSettings from '@/config/settings.json'
import editorAPI from '@/api/editor'
import type { AppState } from './types'

dayjs.extend(utc)
dayjs.extend(timezone)

const useAppStore = defineStore('app', () => {
  // State
  const theme = ref(defaultSettings.theme)
  const navbar = ref(defaultSettings.navbar)
  const device = ref(defaultSettings.device)
  const hideMenu = ref(defaultSettings.hideMenu)
  const menuCollapse = ref(defaultSettings.menuCollapse)
  const footer = ref(defaultSettings.footer)
  const menuWidth = ref(defaultSettings.menuWidth)
  const globalSettings = ref(defaultSettings.globalSettings)
  const host = ref(defaultSettings.host)
  const database = ref(defaultSettings.database)
  const databaseList = ref<string[]>(defaultSettings.databaseList)
  const guideModalVisible = ref(defaultSettings.guideModalVisible)
  const username = ref(defaultSettings.username)
  const password = ref(defaultSettings.password)
  const dbId = ref(defaultSettings.dbId)
  const lifetime = ref(defaultSettings.lifetime)
  const menuSelectedKey = ref(defaultSettings.menuSelectedKey)
  const userTimezone = ref(defaultSettings.userTimezone?.trim() || dayjs.tz.guess())
  const hideSidebar = ref(defaultSettings.hideSidebar)
  const authHeader = ref(defaultSettings.authHeader)

  // Actions
  const updateSettings = (partial: Partial<AppState>) => {
    if (partial.theme !== undefined) theme.value = partial.theme
    if (partial.device !== undefined) device.value = partial.device
    if (partial.hideMenu !== undefined) hideMenu.value = partial.hideMenu
    if (partial.host !== undefined) host.value = partial.host
    if (partial.database !== undefined) database.value = partial.database
    if (partial.username !== undefined) username.value = partial.username
    if (partial.password !== undefined) password.value = partial.password
    if (partial.authHeader !== undefined) authHeader.value = partial.authHeader
    if (partial.globalSettings !== undefined) globalSettings.value = partial.globalSettings
    if (partial.databaseList !== undefined) databaseList.value = partial.databaseList
    if (partial.menuCollapse !== undefined) menuCollapse.value = partial.menuCollapse
    if (partial.footer !== undefined) footer.value = partial.footer
    if (partial.menuWidth !== undefined) menuWidth.value = partial.menuWidth
    if (partial.guideModalVisible !== undefined) guideModalVisible.value = partial.guideModalVisible
    if (partial.dbId !== undefined) dbId.value = partial.dbId
    if (partial.lifetime !== undefined) lifetime.value = partial.lifetime
    if (partial.menuSelectedKey !== undefined) menuSelectedKey.value = partial.menuSelectedKey
    if (partial.userTimezone !== undefined) userTimezone.value = partial.userTimezone
    if (partial.hideSidebar !== undefined) hideSidebar.value = partial.hideSidebar
  }

  const updateConfigStorage = (config?: Partial<AppState>) => {
    const configToSave = config || {
      host: host.value,
      database: database.value,
      username: username.value,
      password: password.value,
      authHeader: authHeader.value,
      userTimezone: userTimezone.value,
    }

    useStorage('config', configToSave, localStorage, {
      mergeDefaults: (storageValue, defaults) => {
        return {
          ...storageValue,
          ...defaults,
        }
      },
    })
  }

  const login = async (form: Partial<AppState>): Promise<boolean> => {
    try {
      updateSettings(form)
      // check if settings are valid
      await editorAPI.runSQL(`select 1`)
      const { resetDataStatus } = useUserStore()
      resetDataStatus()
      // Only update storage if login success
      updateConfigStorage()
      return true
    } catch (error) {
      const { resetData } = useDataBaseStore()
      resetData()
      updateSettings({ globalSettings: true })
      return false
    }
  }

  const toggleTheme = (dark: boolean) => {
    if (dark) {
      theme.value = 'dark'
      document.body.setAttribute('arco-theme', 'dark')
    } else {
      theme.value = 'light'
      document.body.removeAttribute('arco-theme')
    }
  }

  const toggleDevice = (deviceType: string) => {
    device.value = deviceType
  }

  const toggleMenu = (value: boolean) => {
    hideMenu.value = value
  }

  const fetchDatabases = async (): Promise<boolean> => {
    try {
      updateConfigStorage({ database: database.value })
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

      return true
    } catch (error) {
      // databaseList.value = []
      // database.value = 'public'
      globalSettings.value = true
      return false
    }
  }

  const tableCatalog = computed(() => {
    return database.value.split('-').slice(0, -1).join('-') || 'greptime'
  })
  const tableSchema = computed(() => {
    return database.value.split('-').slice(-1).join('-')
  })

  return {
    // State
    theme,
    navbar,
    device,
    hideMenu,
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
    menuWidth,
    dbId,
    lifetime,
    menuSelectedKey,
    userTimezone,
    hideSidebar,

    // Actions
    updateSettings,
    updateConfigStorage,
    login,
    toggleTheme,
    toggleDevice,
    toggleMenu,
    fetchDatabases,
    tableCatalog,
    tableSchema,
  }
})

export default useAppStore
