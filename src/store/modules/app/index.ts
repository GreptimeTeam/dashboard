import { defineStore } from 'pinia'
import { Notification } from '@arco-design/web-vue'
import type { NotificationReturn } from '@arco-design/web-vue/es/notification/interface'
import { useStorage } from '@vueuse/core'
import type { RouteRecordNormalized } from 'vue-router'
import defaultSettings from '@/config/settings.json'
import editorAPI from '@/api/editor'
import { AppState } from './types'

const useAppStore = defineStore('app', {
  state: (): AppState => ({ ...defaultSettings }),

  getters: {
    appCurrentSetting(state: AppState): AppState {
      return { ...state }
    },
    appDevice(state: AppState) {
      return state.device
    },
    appAsyncMenus(state: AppState): RouteRecordNormalized[] {
      return state.serverMenu as unknown as RouteRecordNormalized[]
    },
  },

  actions: {
    // Update app settings
    updateSettings(partial: Partial<AppState>) {
      // @ts-ignore-next-line
      this.$patch(partial)
    },

    updateConfigStorage(config?: Partial<AppState>) {
      if (!config) {
        config = {
          host: this.host,
          database: this.database,
          username: this.username,
          password: this.password,
        }
      }
      useStorage('config', config, localStorage, {
        mergeDefaults: (storageValue, defaults) => {
          return {
            ...storageValue,
            ...defaults,
          }
        },
      })
    },

    async login(form: Partial<AppState>) {
      try {
        this.updateSettings(form)
        // check if settings are valid
        await editorAPI.runSQL(`select 1`)
        const { resetDataStatus } = useUserStore()
        resetDataStatus()
        // Only update storage if login success
        this.updateConfigStorage()
      } catch (error) {
        const { resetData } = useDataBaseStore()
        resetData()
        return false
      }
      return true
    },

    // Change theme color
    toggleTheme(dark: boolean) {
      if (dark) {
        this.theme = 'dark'
        document.body.setAttribute('arco-theme', 'dark')
      } else {
        this.theme = 'light'
        document.body.removeAttribute('arco-theme')
      }
    },
    toggleDevice(device: string) {
      this.device = device
    },
    toggleMenu(value: boolean) {
      this.hideMenu = value
    },
    async fetchServerMenuConfig() {
      let notifyInstance: NotificationReturn | null = null
      try {
        notifyInstance = Notification.info({
          id: 'menuNotice', // Keep the instance id the same
          content: 'loading',
          closable: true,
        })

        notifyInstance = Notification.success({
          id: 'menuNotice',
          content: 'success',
          closable: true,
        })
      } catch (error) {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        notifyInstance = Notification.error({
          id: 'menuNotice',
          content: 'error',
          closable: true,
        })
      }
    },
    clearServerMenu() {
      this.serverMenu = []
    },
    async fetchDatabases() {
      try {
        const res: any = await editorAPI.getDatabases()
        this.updateConfigStorage({ database: this.database })
        this.databaseList = res.output[0].records.rows.map((item: string[]) => item[0])
        this.databaseList = this.databaseList.sort((a: string, b: string) => {
          if (a === 'public') {
            return -1
          }
          if (b === 'public') {
            return 1
          }
          if (a === 'greptime_private' || a === 'information_schema') {
            return 1
          }
          if (b === 'greptime_private' || b === 'information_schema') {
            return -1
          }
          return 0
        })

        if (!this.databaseList.includes(this.database)) {
          this.database = this.databaseList[0]
        }
        const { databaseActiveKeys: keys } = storeToRefs(useDataBaseStore())
        keys.value = [this.database]

        return true
      } catch (error) {
        // some error

        this.databaseList = []
        return false
      }
    },
    setDefaultDatabase() {
      this.database = this.databaseList.includes('public')
        ? 'public'
        : this.databaseList.find((item: string) => item !== 'information_schema') || this.databaseList[0]
    },

    async getDBandTables() {
      const databaseStore = useDataBaseStore()
      const hasDB = await this.fetchDatabases()
      if (!hasDB) {
        return
      }
      await databaseStore.checkTables()
    },
  },
})

export default useAppStore
