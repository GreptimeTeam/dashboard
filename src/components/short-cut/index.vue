<template lang="pug">
a-tooltip(:content="codeInfo.code")
  a-button(
    type="text"
    size="small"
    :class="{ 'arco-btn-only-icon': label === '' }"
    @click="clickShortCut(codeInfo.code, codeInfo.cursorPosition)"
  ) {{ label }}
    template(v-if="label === ''" #icon)
      svg.icon-16.icon-color
        use(href="#query")
</template>

<script lang="ts" setup name="ShortCut">
  import type { TableTreeParent, TreeChild } from '@/store/modules/database/types'

  const props = defineProps<{
    label: string
    type: string
    node: TreeChild
    parent: TableTreeParent
  }>()

  const { inputFromNewLineToQueryCode } = useQueryCode()

  const { updateSettings } = useAppStore()

  const clickShortCut = (info: string, cursorPosition: number) => {
    inputFromNewLineToQueryCode(info, cursorPosition)
    updateSettings({ queryModalVisible: true })
  }

  const formatter = (code: string) => {
    // No format for now.
    return code
  }

  const getCodeAndCursorPos = (type: string, node: TreeChild, parent: TableTreeParent) => {
    const orderBy = parent.timeIndexName !== `%TIMESTAMP%` ? ` ORDER BY ${parent.timeIndexName} ` : ` `
    switch (type) {
      case 'select*100':
        return {
          code: formatter(`SELECT * FROM "${parent.title}"${orderBy}DESC LIMIT 100;`),
          cursorPosition: 0,
        }
      case 'count':
        return {
          code: formatter(`SELECT count(*) FROM "${parent.title}" GROUP BY ${node.title};`),
          cursorPosition: 0,
        }
      case 'where=':
        return {
          code: formatter(`SELECT * FROM "${parent.title}" WHERE ${node.title} = ${orderBy}DESC;`),
          cursorPosition: `${orderBy}DESC;`.length,
        }
      case 'select100':
        return {
          code: formatter(`SELECT ${node.title} FROM "${parent.title}"${orderBy}DESC LIMIT 100;`),
          cursorPosition: 0,
        }
      case 'max':
        return {
          code: formatter(`SELECT max(${node.title}) FROM "${parent.title}";`),
          cursorPosition: 0,
        }
      case 'min':
        return {
          code: formatter(`SELECT min(${node.title}) FROM "${parent.title}";`),
          cursorPosition: 0,
        }
      case 'where<':
        return {
          code: formatter(`SELECT * FROM "${parent.title}" WHERE ${parent.timeIndexName} < ${orderBy}DESC LIMIT 100;`),
          cursorPosition: `${orderBy}DESC LIMIT 100;`.length,
        }
      default:
        return {
          code: '',
          cursorPosition: 0,
        }
    }
  }

  const codeInfo = computed(() => {
    return getCodeAndCursorPos(props.type, props.node, props.parent)
  })
</script>
