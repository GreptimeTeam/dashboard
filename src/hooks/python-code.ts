import { Log } from '@/store/modules/log/types'
import { Md5 } from 'ts-md5'
import { Message } from '@arco-design/web-vue'
import i18n from '@/locale'

const { saveScript } = useCodeRunStore()

const pythonCode = ref('')
const lastSavedCode = ref('')

const scriptSelectedKeys = ref<Array<string>>([])
const lastSelectedKey = ref<Array<string>>([])

const cursorAt = ref<Array<number>>([])
const scriptName = ref('')
const isNewScript = ref(true)
const modelVisible = ref(false)
const creating = ref(false)
const scriptSaving = ref(false)
const scriptRunning = ref(false)
const isChanged = computed(() => Md5.hashStr(pythonCode.value) !== Md5.hashStr(lastSavedCode.value))

export default function usePythonCode() {
  const { pushLog } = useLog()
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
    try {
      const res = await saveScript(name, code)
      Message.success({
        content: i18n.global.t('dashboard.saveSuccess'),
        duration: 2 * 1000,
      })
      pushLog(res, 'python')
    } catch (err: any) {
      throw pushLog(JSON.parse(err.message) as Log, 'python')
    }
  }

  const isButtonDisabled = computed(() => {
    if (
      scriptRunning.value === true ||
      scriptSaving.value === true ||
      scriptName.value.trim().length === 0 ||
      pythonCode.value.trim().length === 0
    )
      return true
    return false
  })

  return {
    insertNameToPyCode,
    overwriteCode,
    createNewScript,
    selectAfterSave,
    resetScript,
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
    isButtonDisabled,
    scriptSaving,
    scriptRunning,
    save,
  }
}
