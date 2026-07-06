import { getStatus } from '@/api/status'

export function formatGreptimeVersion(raw: string): string {
  const value = raw.trim()
  if (!value || value === '—') return value
  return /^v/i.test(value) ? value : `v${value}`
}

export default function useGreptimeVersion() {
  const version = ref('')
  const loading = ref(false)

  const fetchVersion = async () => {
    if (version.value || loading.value) return
    loading.value = true
    try {
      const data = (await getStatus()) as Record<string, unknown> | null
      const rawVersion = data?.version ?? data?.Version
      version.value = rawVersion ? formatGreptimeVersion(String(rawVersion)) : ''
    } catch (error) {
      console.warn('Failed to fetch GreptimeDB version:', error)
      version.value = ''
    } finally {
      loading.value = false
    }
  }

  onMounted(() => {
    fetchVersion()
  })

  return {
    version,
    loading,
    fetchVersion,
  }
}
