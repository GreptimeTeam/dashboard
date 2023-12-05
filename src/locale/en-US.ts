import dashboard from './en-US/dashboard.json'
import feedback from './en-US/feedback.json'
import menu from './en-US/menu.json'
import playground from './en-US/playground.json'
import settings from './en-US/settings.json'
import workbench from './en-US/workbench.json'

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
