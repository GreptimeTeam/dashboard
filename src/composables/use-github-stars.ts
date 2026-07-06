const REPO = 'GreptimeTeam/greptimedb'
const FALLBACK_STARS = 6400

export default function useGithubStars() {
  const stars = ref<number | null>(null)
  const loading = ref(false)
  const error = ref(false)

  const formattedStars = computed(() => {
    const count = stars.value ?? FALLBACK_STARS
    if (count >= 1000) {
      return `${(count / 1000).toFixed(1).replace(/\.0$/, '')}k`
    }
    return count.toString()
  })

  const repoUrl = `https://github.com/${REPO}`

  const load = async () => {
    if (stars.value !== null || loading.value) return
    loading.value = true
    error.value = false
    try {
      const response = await fetch(`https://api.github.com/repos/${REPO}`)
      if (!response.ok) throw new Error('Failed to fetch GitHub stars')
      const data = await response.json()
      stars.value = typeof data.stargazers_count === 'number' ? data.stargazers_count : FALLBACK_STARS
    } catch (e) {
      console.warn('Failed to fetch GitHub stars:', e)
      error.value = true
      stars.value = FALLBACK_STARS
    } finally {
      loading.value = false
    }
  }

  onMounted(() => {
    load()
  })

  return {
    stars,
    formattedStars,
    loading,
    error,
    repoUrl,
    load,
  }
}
