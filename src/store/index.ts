import { createPinia } from 'pinia'
import useAppStore from './modules/app'
import useUserStore from './modules/user'
import useTabBarStore from './modules/tab-bar'
import useDataBaseStore from './modules/database'
import useCodeRunStore from './modules/code-run'
import useLogStore from './modules/log'

const pinia = createPinia()

export { useAppStore, useUserStore, useTabBarStore, useDataBaseStore, useCodeRunStore, useLogStore }
export default pinia
