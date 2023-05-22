import { getGist } from '@/api/gist'

export default function useGist() {
  const getGistFiles = async (gistId: string) => {
    const res = await getGist(gistId)

    return Object.values(res.files)
  }

  return {
    getGistFiles,
  }
}
