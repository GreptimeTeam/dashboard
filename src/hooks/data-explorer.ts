const columns = ref<any>([])

// todo: change init code
const code = ref('select * from scripts')
const cursorAt = ref<Array<number>>([])
// todo: compare sqlResult's code and current code
const { currentResult } = storeToRefs(useCodeRunStore())

export default function useDataExplorer() {
  // todo: change to computed instead of using array?

  const insertCode = (value: any) => {
    code.value = `${code.value}\n${value}`
  }

  const insertNameToCode = (name: any) => {
    code.value = code.value.substring(0, cursorAt.value[0]) + name + code.value.substring(cursorAt.value[1])
  }

  // todo: save code temp to local storage

  return {
    insertCode,
    insertNameToCode,
    code,
    cursorAt,
    columns,
  }
}
