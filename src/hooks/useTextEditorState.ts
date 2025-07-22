import { reactive } from 'vue'
import { TSColumn } from '@/views/dashboard/logs/query/types'

export interface TextEditorState {
  editorSql: string
  editorTsColumn: TSColumn | null
  editorTableName: string
}

const useTextEditorState = (defaults: Partial<TextEditorState> = {}) => {
  const state = reactive<TextEditorState>({
    editorSql: '',
    editorTsColumn: null,
    editorTableName: '',
    ...defaults,
  })

  function reset() {
    state.editorSql = ''
    state.editorTsColumn = null
    state.editorTableName = ''
  }

  function updateSql(sql: string) {
    state.editorSql = sql
  }

  function updateTsColumn(tsColumn: TSColumn | null) {
    state.editorTsColumn = tsColumn
  }

  function updateTableName(tableName: string) {
    state.editorTableName = tableName
  }

  return {
    state,
    reset,
    updateSql,
    updateTsColumn,
    updateTableName,
  }
}

export default useTextEditorState
