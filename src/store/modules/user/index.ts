import { defineStore } from 'pinia'

const useUserStore = defineStore('user', {
  state: () => ({
    role: '',
  }),

  getters: {
    userInfo() {
      return {}
    },
  },

  actions: {
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
