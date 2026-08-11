import editorApi from '@/api/editor'

export function formatGreptimeVersion(raw: string): string {
  const value = raw.trim()
  if (!value || value === '—') return value
  return /^v/i.test(value) ? value : `v${value}`
}

type BuildInfo = {
  version: string
  commit: string
}

function cellToString(value: unknown): string {
  if (value === null || value === undefined) return ''
  return String(value).trim()
}

export function parseBuildInfoFromSqlResult(data: unknown): BuildInfo {
  const records = (data as any)?.output?.[0]?.records
  const schemas = records?.schema?.column_schemas
  const rows = records?.rows
  if (!Array.isArray(rows) || rows.length === 0 || !Array.isArray(rows[0])) {
    return { version: '', commit: '' }
  }

  const row = rows[0] as unknown[]
  const getByName = (name: string): string => {
    if (!Array.isArray(schemas)) return ''
    const index = schemas.findIndex((col: { name?: string }) => col?.name === name)
    if (index < 0) return ''
    return cellToString(row[index])
  }

  const pkgVersion = getByName('pkg_version')
  const commitShort = getByName('git_commit_short')
  const commitFull = getByName('git_commit')

  return {
    version: pkgVersion ? formatGreptimeVersion(pkgVersion) : '',
    commit: commitShort || commitFull,
  }
}

export default function useGreptimeVersion() {
  const version = ref('')
  const commit = ref('')
  const loading = ref(false)

  const fetchVersion = async () => {
    if (version.value || commit.value || loading.value) return
    loading.value = true
    try {
      const data = await editorApi.runSQL('select * from information_schema.build_info')
      const buildInfo = parseBuildInfoFromSqlResult(data)
      version.value = buildInfo.version
      commit.value = buildInfo.commit
    } catch (error) {
      console.warn('Failed to fetch GreptimeDB build info:', error)
      version.value = ''
      commit.value = ''
    } finally {
      loading.value = false
    }
  }

  onMounted(() => {
    fetchVersion()
  })

  return {
    version,
    commit,
    loading,
    fetchVersion,
  }
}
