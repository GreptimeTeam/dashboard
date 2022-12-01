import { defineStore } from 'pinia'
import { UserState } from './types'

const useUserStore = defineStore('user', {
  state: () => ({}),

  getters: {
    userInfo() {
      return {}
    },
  },

  actions: {
    switchRoles() {},
    // Set user's information
    setInfo() {},

    // Reset user's information
    resetInfo() {},

    // Get user's information
    async info() {},
  },
})

export default useUserStore
