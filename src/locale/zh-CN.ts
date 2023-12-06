import dashboard from './zh-CN/dashboard'
import feedback from './zh-CN/feedback'
import menu from './zh-CN/menu'
import playground from './zh-CN/playground'
import settings from './zh-CN/settings'
import workbench from './zh-CN/workbench'

export default {
  'navbar.docs': '文档中心',
  'navbar.action.locale': '切换为中文',
  ...dashboard,
  ...feedback,
  ...menu,
  ...playground,
  ...settings,
  ...workbench,
}
