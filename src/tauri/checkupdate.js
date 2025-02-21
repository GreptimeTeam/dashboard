import { check } from '@tauri-apps/plugin-updater'
import { relaunch } from '@tauri-apps/plugin-process'
import { confirm } from '@tauri-apps/plugin-dialog'

export default async function checkUpdate() {
  console.log('checkForUpdatesOnStart')
  try {
    const update = await check()
    console.log('check result', update)
    if (update) {
      const confirmation = await confirm(
        `Found update ${update.version} from ${update.date} with notes ${update.body}`,
        { title: 'Update', kind: 'info' }
      )
      if (confirmation) {
        console.log(`Found update ${update.version} from ${update.date} with notes ${update.body}`)
        let downloaded = 0
        let contentLength = 0

        await update.downloadAndInstall((event) => {
          switch (event.event) {
            case 'Started':
              contentLength = event.data.contentLength
              console.log(`Started downloading ${event.data.contentLength} bytes`)
              break
            case 'Progress':
              downloaded += event.data.chunkLength
              console.log(`Downloaded ${downloaded} from ${contentLength}`)
              break
            case 'Finished':
              console.log('Download finished')
              break
          }
        })

        console.log('Update installed')
        await relaunch()
      }
    } else {
      console.log('No updates available.')
    }
  } catch (error) {
    console.error('Failed to check for updates:', error)
  }
}

// 在应用启动时调用
// checkForUpdatesOnStart()
