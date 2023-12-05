import dashboard from './zh-CN/dashboard.json'
import feedback from './zh-CN/feedback.json'
import menu from './zh-CN/menu.json'
import playground from './zh-CN/playground.json'
import settings from './zh-CN/settings.json'
import workbench from './zh-CN/workbench.json'

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
