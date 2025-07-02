import dashboard from './zh-CN/dashboard'
import menu from './zh-CN/menu'
import playground from './zh-CN/playground'
import settings from './zh-CN/settings'
import logsQuery from './zh-CN/logs-query'

export default {
  'navbar.action.locale': '切换到中文',
  'navbar.docs': '文档',
  'copied': '已复制',
  'guide.confirm': '确定',
  'guide.welcome': '欢迎！',
  ...dashboard,
  ...menu,
  ...playground,
  ...settings,
}
