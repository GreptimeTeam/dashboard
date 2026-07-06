import { getStatus } from '@/api/status'

export default function useGreptimeVersion() {
  const version = ref('')
  const loading = ref(false)

  const fetchVersion = async () => {
    if (version.value || loading.value) return
    loading.value = true
    try {
      const data = (await getStatus()) as Record<string, unknown> | null
      const rawVersion = data?.version ?? data?.Version
      version.value = rawVersion ? String(rawVersion).trim() : ''
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
