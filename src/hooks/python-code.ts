import { Md5 } from 'ts-md5'
import { Message } from '@arco-design/web-vue'
import { useI18n } from 'vue-i18n'

const { saveScript } = useCodeRunStore()
const { pushLog } = useLog()

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

export default function usePythonCode() {
  const i18 = useI18n()
  const insertNameToPyCode = (name: any) => {
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
    lastSelectedKey.value = []
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

  const save = async (name: string, code: string) => {
    const res = await saveScript(name, code)
    Message.success({
      content: i18.t('dataExplorer.saveSuccess'),
      duration: 2 * 1000,
    })
    await pushLog(res, 'python')
  }
  return {
    insertNameToPyCode,
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
    save,
  }
}
