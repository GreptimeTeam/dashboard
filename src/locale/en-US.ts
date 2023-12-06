import dashboard from './en-US/dashboard'
import feedback from './en-US/feedback'
import menu from './en-US/menu'
import playground from './en-US/playground'
import settings from './en-US/settings'
import workbench from './en-US/workbench'

export default {
  'alert.createSuccess': 'create alert config Success',
  'alert.removeSuccess': 'remove alert config Success',
  'alert.updateSuccess': 'update alert config Success',
  'copied': 'Copied',
  'guide.confirm': 'Confirm',
  'guide.welcome': 'Welcome!',
  'navbar.action.locale': 'Switch to English',
  'navbar.docs': 'Docs',
  ...dashboard,
  ...feedback,
  ...menu,
  ...playground,
  ...settings,
  ...workbench,
}
