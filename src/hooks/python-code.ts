import { Md5 } from 'ts-md5'

const pythonCode = ref('')
const lastSavedCode = ref('')

const scriptSelectedKeys = ref<Array<string>>([])
const lastSelectedKey = ref<Array<string>>([])

const cursorAt = ref<Array<number>>([])
const scriptName = ref('')
const isNewScript = ref(<boolean>true)
const modelVisible = ref(false)
const creating = ref(false)
const isChanged = computed(() => Md5.hashStr(pythonCode.value) !== Md5.hashStr(lastSavedCode.value))

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
    isNewScript.value = false
    pythonCode.value = script.code
    lastSelectedKey.value = [script.key]
    lastSavedCode.value = pythonCode.value
  }

  const resetScript = () => {
    scriptName.value = ''
    isNewScript.value = true
    pythonCode.value = ''
    scriptSelectedKeys.value = []
    lastSavedCode.value = ''
    creating.value = false
  }

  const createNewScript = () => {
    creating.value = true
    if (!isChanged.value) {
      resetScript()
    } else {
      modelVisible.value = true
    }
  }

  const selectAfterSave = (name: string) => {
    scriptSelectedKeys.value = [name]
    isNewScript.value = false
    lastSavedCode.value = pythonCode.value
  }

  // TODO: save code temp to local storage

  return {
    insertCode,
    insertNameToCode,
    overwriteCode,
    createNewScript,
    selectAfterSave,
    pythonCode,
    lastSavedCode,
    cursorAt,
    scriptName,
    isNewScript,
    scriptSelectedKeys,
    lastSelectedKey,
    isChanged,
    modelVisible,
    creating,
  }
}
