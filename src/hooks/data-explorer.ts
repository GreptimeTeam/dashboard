const sqlCode = ref('SELECT * FROM numbers')
const cursorAt = ref<Array<number>>([])
const { currentResult } = storeToRefs(useCodeRunStore())

export default function useDataExplorer() {
  const insertCode = (value: any) => {
    sqlCode.value = `${sqlCode.value}\n${value}`
  }

  const insertNameToCode = (name: any) => {
    sqlCode.value = sqlCode.value.substring(0, cursorAt.value[0]) + name + sqlCode.value.substring(cursorAt.value[1])
  }

  return {
    insertCode,
    insertNameToCode,
    sqlCode,
    cursorAt,
  }
}
