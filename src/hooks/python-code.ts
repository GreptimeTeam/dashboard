const pythonCode = ref('')
const lastSavedCode = ref('')
const cursorAt = ref<Array<number>>([])
const scriptName = ref('')
const ifNewScript = ref(<boolean>true)
const scriptSelectedKeys = ref<Array<string>>([])

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

  const createNewScript = () => {
    scriptName.value = ''
    ifNewScript.value = true
    pythonCode.value = ''
    scriptSelectedKeys.value = []
  }

  const saveTempCode = () => {}

  const selectAfterSave = (name: string) => {
    scriptSelectedKeys.value = [name]
    ifNewScript.value = false
    saveTempCode()
  }

  // TODO: save code temp to local storage

  return {
    insertCode,
    insertNameToCode,
    overwriteCode,
    createNewScript,
    selectAfterSave,
    pythonCode,
    cursorAt,
    scriptName,
    ifNewScript,
    scriptSelectedKeys,
  }
}
