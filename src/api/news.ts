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
  proxyUrl: 'https://proxy-for-blogs-rss-in-dashboard.greptime.workers.dev',
}
const CACHE_KEY = 'greptime_news_cache'
const TTL_MS = 10 * 60 * 1000

const setCachedNews = (items: NewsItem[]) => {
  const data = {
    items,
    timestamp: Date.now(),
  }
  localStorage.setItem(CACHE_KEY, JSON.stringify(data))
}

const getCachedNews = (): NewsResponse | null => {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    if (!raw) return null

    const { items, timestamp } = JSON.parse(raw)
    if (Date.now() - timestamp > TTL_MS) {
      localStorage.removeItem(CACHE_KEY)
      return null
    }

    return { items }
  } catch {
    localStorage.removeItem(CACHE_KEY)
    return null
  }
}

const formatDate = (pubDate: string): string => {
  try {
    const date = dayjs(pubDate)
    if (!date.isValid()) {
      return pubDate
    }
    return date.format('MMMM D, YYYY')
  } catch (error) {
    return pubDate
  }
}

const parseXmlRss = (xmlString: string): NewsItem[] => {
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
      .slice(0, 3)
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
  try {
    const cached = getCachedNews()
    if (cached) {
      return cached
    }

    const response = await fetch(NEWS_CONFIG.proxyUrl, {
      method: 'GET',
      headers: {
        Accept: 'application/xml, text/xml, */*',
      },
    })

    if (!response.ok) {
      console.warn('Failed to fetch RSS feed:', response.status, response.statusText)
      return { items: [] }
    }

    const xmlData = await response.text()
    const parsedItems = parseXmlRss(xmlData)

    // Cache the parsed items (top 3 news items)
    setCachedNews(parsedItems)

    if (parsedItems.length === 0) {
      console.warn('No news items found in RSS feed')
      return { items: [] }
    }

    return {
      items: parsedItems,
    }
  } catch (error: any) {
    console.warn('Failed to fetch Greptime news:', error.message)
    return { items: [] }
  }
}
