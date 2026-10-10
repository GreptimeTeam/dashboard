import { onActivated, onDeactivated, ref } from 'vue'

export default function useDrilldownKeepAlive(options: { deps: () => string; resume?: () => void | Promise<void> }) {
  const isActive = ref(true)
  let pausedDepsKey = ''
  let resumeHandler = options.resume ?? (() => undefined)

  onDeactivated(() => {
    isActive.value = false
    pausedDepsKey = options.deps()
  })

  onActivated(() => {
    isActive.value = true
    if (pausedDepsKey && pausedDepsKey !== options.deps()) {
      resumeHandler()
    }
    pausedDepsKey = ''
  })

  return {
    isActive,
    setResume(resume: () => void | Promise<void>) {
      resumeHandler = resume
    },
  }
}
