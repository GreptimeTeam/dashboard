import editorApi from '@/api/editor'

export function formatGreptimeVersion(raw: string): string {
  const value = raw.trim()
  if (!value || value === '—') return value
  return /^v/i.test(value) ? value : `v${value}`
}

export default function useGreptimeVersion() {
  const version = ref('')
  const loading = ref(false)

  const parseVersionFromSqlResult = (data: unknown): string => {
    const rows = (data as any)?.output?.[0]?.records?.rows
    if (!Array.isArray(rows) || rows.length === 0) return ''
    const firstRow = rows[0]
    if (!Array.isArray(firstRow) || firstRow.length === 0) return ''
    const raw = firstRow[0]
    return raw === null || raw === undefined ? '' : String(raw)
  }

  const fetchVersion = async () => {
    if (version.value || loading.value) return
    loading.value = true
    try {
      const data = await editorApi.runSQL('select version()')
      const rawVersion = parseVersionFromSqlResult(data)
      version.value = rawVersion ? formatGreptimeVersion(rawVersion) : ''
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
