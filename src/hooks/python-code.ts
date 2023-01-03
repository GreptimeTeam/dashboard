const pythonCode = ref('')
const cursorAt = ref<Array<number>>([])
const scriptName = ref('')
const ifNewScript = ref(<boolean>true)

// TODO: compare sqlResult's code and current code
const { currentResult } = storeToRefs(useCodeRunStore())

export default function useDataExplorer() {
  const insertCode = (value: any) => {
    pythonCode.value = `${pythonCode.value}\n${value}`
  }

  const insertNameToCode = (name: any) => {
    pythonCode.value =
      pythonCode.value.substring(0, cursorAt.value[0]) + name + pythonCode.value.substring(cursorAt.value[1])
  }

  const overwriteCode = (script: any) => {
    scriptName.value = script.key
    ifNewScript.value = false
    pythonCode.value = script.code
  }
  // TODO: save code temp to local storage

  return {
    insertCode,
    insertNameToCode,
    overwriteCode,
    pythonCode,
    cursorAt,
    scriptName,
    ifNewScript,
  }
}
