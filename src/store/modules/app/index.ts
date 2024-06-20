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

    // Login (check if settings are valid)
    async login(form?: Partial<AppState>) {
      try {
        if (form) {
          this.updateSettings(form)
        }
        await editorAPI.runSQL(`select 1`)
        const { resetDataStatus } = useUserStore()
        resetDataStatus()
        const config = {
          host: this.host,
          database: this.database,
          username: this.username,
          password: this.password,
        }
        // Only update storage if login success
        useStorage('config', config, localStorage, {
          mergeDefaults: (storageValue, defaults) => {
            return {
              ...storageValue,
              ...defaults,
            }
          },
        })
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
        this.databaseList = res.output[0].records.rows.flat()
        if (this.$state.database && this.databaseList.includes(this.$state.database)) {
          this.database = this.$state.database
        } else if (this.databaseList.length) {
          this.setDefaultDatabase()
        }
        // check if settings are valid
        this.login()
      } catch (error) {
        // some error
      }
    },
    setDefaultDatabase() {
      this.database = this.databaseList.includes('public')
        ? 'public'
        : this.databaseList.find((item: string) => item !== 'information_schema') || this.databaseList[0]
    },
  },
})

export default useAppStore
