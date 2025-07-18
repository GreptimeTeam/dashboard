import dashboard from './en-US/dashboard'
import settings from './en-US/settings'
import menu from './en-US/menu'
import playground from './en-US/playground'
import logsQuery from './en-US/logs-query'

export default {
  'navbar.action.locale': 'Switch to English',
  'navbar.docs': 'Docs',
  'copied': 'Copied',
  'guide.confirm': 'Confirm',
  'guide.welcome': 'Welcome!',
  'news.seeAll': 'See all news',
  ...dashboard,
  ...settings,
  ...menu,
  ...playground,
  ...logsQuery,
}
