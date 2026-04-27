import { useAppStore } from '@/store'

export default function useThemes() {
  const { isDark } = useAppStore()
  return { isDark }
}
