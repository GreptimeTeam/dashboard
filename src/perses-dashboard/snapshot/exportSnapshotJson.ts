function stripJsonExtension(name: string): string {
  return name.endsWith('.json') ? name.slice(0, -5) : name
}

function resolveDownloadFilename(content: string, fallbackName: string): string {
  try {
    const parsed = JSON.parse(content) as {
      metadata?: { name?: string }
      spec?: { display?: { name?: string } }
    }
    const fromMetadata = parsed.metadata?.name?.trim()
    if (fromMetadata) {
      const base = stripJsonExtension(fromMetadata)
      return base.endsWith('.json') ? base : `${base}.json`
    }
    const fromDisplay = parsed.spec?.display?.name?.trim()
    if (fromDisplay) {
      const base = stripJsonExtension(fromDisplay)
      return base.endsWith('.json') ? base : `${base}.json`
    }
  } catch {
    // fall through
  }

  const base = stripJsonExtension(fallbackName.trim() || 'snapshot-dashboard')
  return base.endsWith('.json') ? base : `${base}.json`
}

export default function downloadDashboardJson(content: string, fallbackName: string): void {
  if (!content?.trim()) {
    throw new Error('Dashboard content is empty')
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(content)
  } catch {
    throw new Error('Invalid dashboard JSON')
  }

  const formatted = JSON.stringify(parsed, null, 2)
  const filename = resolveDownloadFilename(content, fallbackName)
  const blob = new Blob([formatted], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.style.display = 'none'
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}
