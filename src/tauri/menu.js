import { Menu, MenuItem, Submenu, PredefinedMenuItem } from '@tauri-apps/api/menu'
import { getVersion } from '@tauri-apps/api/app'
import checkForUpdates from './checkupdate'

async function setAppMenu() {
  console.log('setAppMenu')
  try {
    const quitItem = await PredefinedMenuItem.new({
      text: 'Quit',
      item: 'Quit',
    })

    const version = await getVersion()

    const aboutItem = await MenuItem.new({
      id: 'version',
      text: `version: ${version}`,
    })
    const checkItem = await MenuItem.new({
      id: 'check',
      text: 'Check Version',
      action: () => {
        checkForUpdates()
      },
    })

    const submenu = await Submenu.new({
      text: 'app',
      items: [aboutItem, checkItem, quitItem],
    })
    const menu = await Menu.new({
      items: [submenu],
    })
    await menu.setAsAppMenu()
    console.log('✅ Menu set successfully')
  } catch (error) {
    console.error('❌ Failed to set application menu:', error)
    if (error instanceof Error) {
      console.error('Error details:', error.message, error.stack)
    } else {
      console.error('Unknown error:', error)
    }
  }
}

setAppMenu()
