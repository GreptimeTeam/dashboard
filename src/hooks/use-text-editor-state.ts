import { ref, type Ref } from 'vue'
import { TextEditorFormState } from '@/types/query'
import { replaceTimePlaceholders } from '@/utils/sql'

const useTextEditorState = (timeRangeValues: Ref<string[]>) => {
  const textEditorState = reactive<TextEditorFormState>({
    table: '',
    orderBy: 'DESC',
    limit: 1000,
    tsColumn: null,
    sql: '',
  })

  const generateSql = (state: TextEditorFormState, timeRange: any[]) => {
    const [startTs, endTs] = timeRange
    return replaceTimePlaceholders(state.sql, [startTs, endTs])
  }

  return {
    textEditorState,
    generateSql,
  }
}

export default useTextEditorState
