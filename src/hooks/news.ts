import { fetchGreptimeNews, type NewsItem } from '@/api/news'

const newsList: Ref<NewsItem[]> = ref([])
const isLoadingNews = ref(false)
const newsError = ref<string | null>(null)

export function useNews() {
  const loadNews = async () => {
    if (isLoadingNews.value) return

    isLoadingNews.value = true
    newsError.value = null

    try {
      const response = await fetchGreptimeNews()
      newsList.value = response.items
    } catch (error) {
      newsError.value = error instanceof Error ? error.message : 'Failed to fetch news'
      console.warn('Failed to fetch news:', error)
    } finally {
      isLoadingNews.value = false
    }
  }

  return {
    newsList: readonly(newsList),
    isLoadingNews: readonly(isLoadingNews),
    newsError: readonly(newsError),
    loadNews,
  }
}

export function initializeNews() {
  if (import.meta.env.MODE !== 'development') {
    const { loadNews } = useNews()
    loadNews()
  }
}
