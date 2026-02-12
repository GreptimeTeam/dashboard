import dayjs from 'dayjs'

export interface NewsItem {
  title: string
  link: string
  date?: string
  description?: string
}

export interface NewsResponse {
  items: NewsItem[]
}

const NEWS_CONFIG = {
  proxyUrl: 'https://feed.greptime.cloud/dashboard/feed',
}

const CACHE_KEY = 'greptime_news_cache'
const UID_KEY = 'greptime_anon_id'
const TTL_MS = 10 * 60 * 1000

const getAnonId = () => {
  let id = localStorage.getItem(UID_KEY)
  if (!id) {
    id = crypto.randomUUID()
    localStorage.setItem(UID_KEY, id)
  }
  return id
}

const setCachedNews = (items: NewsItem[]) => {
  if (!items || items.length === 0) return
  localStorage.setItem(CACHE_KEY, JSON.stringify({ items, timestamp: Date.now() }))
}

const getCachedNews = (): { items: NewsItem[]; timestamp: number } | null => {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    if (!raw) return null
    const { items, timestamp } = JSON.parse(raw)
    return { items, timestamp }
  } catch {
    // localStorage.removeItem(CACHE_KEY)
    return null
  }
}

const isFresh = (ts: number) => Date.now() - ts <= TTL_MS

const formatDate = (pubDate: string): string => {
  try {
    const date = dayjs(pubDate)
    if (!date.isValid()) return pubDate
    return date.format('MMMM D, YYYY')
  } catch {
    return pubDate
  }
}

// Parse RSS XML and return top N items (default 3)
const parseXmlRss = (xmlString: string, topN = 3): NewsItem[] => {
  try {
    const parser = new DOMParser()
    const doc = parser.parseFromString(xmlString, 'text/xml')

    const parserError = doc.querySelector('parsererror')
    if (parserError) {
      console.error('XML parsing error:', parserError.textContent)
      return []
    }

    const items = doc.querySelectorAll('item')
    return Array.from(items)
      .slice(0, topN)
      .map((item) => {
        const title = item.querySelector('title')?.textContent || ''
        const link = item.querySelector('link')?.textContent || ''
        const pubDate = item.querySelector('pubDate')?.textContent || ''
        const description = item.querySelector('description')?.textContent || ''

        return {
          title: title.trim(),
          link: link.trim(),
          date: pubDate ? formatDate(pubDate) : '',
          description: description.trim().replace(/\s+/g, ' '),
        }
      })
  } catch (error) {
    console.error('Error parsing XML RSS:', error)
    return []
  }
}

export const fetchGreptimeNews = async (): Promise<NewsResponse> => {
  const cached = getCachedNews()

  if (cached && isFresh(cached.timestamp)) {
    return { items: cached.items }
  }

  const { role } = useUserStore()
  const headers: Record<string, string> = {
    Accept: 'application/xml, text/xml, */*',
  }
  if (role === 'admin') {
    headers['X-Oss-Uid'] = getAnonId()
  }

  try {
    const response = await fetch(NEWS_CONFIG.proxyUrl, {
      method: 'GET',
      headers,
    })

    if (!response.ok) {
      console.warn('Failed to fetch RSS feed:', response.status, response.statusText)
      return { items: cached?.items ?? [] }
    }

    const xmlData = await response.text()
    const parsedItems = parseXmlRss(xmlData)

    setCachedNews(parsedItems)

    if (parsedItems.length === 0) {
      console.warn('No news items found in RSS feed')
      return { items: cached?.items ?? [] }
    }

    return { items: parsedItems }
  } catch (error: any) {
    console.warn('Failed to fetch Greptime news:', error?.message || error)
    return { items: cached?.items ?? [] }
  }
}
