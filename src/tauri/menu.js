import { Menu, MenuItem, Submenu, PredefinedMenuItem } from '@tauri-apps/api/menu'
import { WebviewWindow } from '@tauri-apps/api/webviewWindow'
import { getVersion } from '@tauri-apps/api/app'

async function setAppMenu() {
  try {
    const quitItem = await PredefinedMenuItem.new({
      text: 'Quit',
      item: 'Quit',
    })
    const version = await getVersion()

    const aboutItem = await MenuItem.new({
      id: 'info',
      text: `Version : ${version}`,
      action: () => {
        const webview = new WebviewWindow('client', {
          url: '/#/client/about',
          title: 'About Greptime Dashboard',
          alwaysOnTop: true,
          center: true,
          height: 300,
          width: 780,
        })
        webview.once('tauri://created', function () {
          console.log('webview created')
        })
      },
    })
    // const checkItem = await MenuItem.new({
    //   id: 'about',
    //   text: 'Check Version',
    //   action: () => {
    //     checkForUpdates()
    //   },
    // })

    const submenu = await Submenu.new({
      text: 'App',
      items: [aboutItem, quitItem],
    })
    const menu = await Menu.new({
      text: 'Greptime Dashboard',
      items: [submenu],
    })
    await menu.setAsAppMenu()
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
