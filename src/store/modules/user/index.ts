import { defineStore } from 'pinia'

const useUserStore = defineStore('user', {
  state: () => ({
    role: 'dev',
  }),

  getters: {
    userInfo() {
      return {}
    },
  },

  actions: {
    setRole(role: string) {
      this.role = role
    },
    // switchRoles() {},
    // // Set user's information
    // setInfo() {},
    // // Reset user's information
    // resetInfo() {},
    // // Get user's information
    // async info() {},
  },
})

export default useUserStore
