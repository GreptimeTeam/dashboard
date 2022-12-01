import { createPinia } from 'pinia'
import useAppStore from './modules/app'
import useUserStore from './modules/user'
import useTabBarStore from './modules/tab-bar'
import useDataBaseStore from './modules/database'
import useCodeRunStore from './modules/code-run'

const pinia = createPinia()

export { useAppStore, useUserStore, useTabBarStore, useDataBaseStore, useCodeRunStore }
export default pinia
