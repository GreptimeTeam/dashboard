<template lang="pug">
a-tooltip(:content="codeInfo.code")
  a-button(type="text" @click="inputFromNewLineToQueryCode(codeInfo.code, codeInfo.cursorPosition)") {{ label }}
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

  const formatter = (code: string) => {
    // No format for now.
    return code
  }

  const getCodeAndCursorPos = (type: string, node: TreeChild, parent: TableTreeParent) => {
    switch (type) {
      case 'select*100':
        return {
          code: formatter(`SELECT * FROM ${parent.title} ORDER BY ${parent.timeIndexName} LIMIT 100;`),
          cursorPosition: 0,
        }
      case 'count':
        return {
          code: formatter(`SELECT count(*) FROM ${parent.title} GROUP BY ${node.title};`),
          cursorPosition: 0,
        }
      case 'where=':
        return {
          code: formatter(
            `SELECT * FROM ${parent.title} WHERE ${node.title} =  ORDER BY ${parent.timeIndexName} DESC;`
          ),
          cursorPosition: 16 + parent.timeIndexName.length,
        }
      case 'select100':
        return {
          code: formatter(`SELECT ${node.title} FROM ${parent.title} ORDER BY ${parent.timeIndexName} DESC LIMIT 100;`),
          cursorPosition: 0,
        }
      case 'max':
        return {
          code: formatter(`SELECT max(${node.title}) FROM ${parent.title};`),
          cursorPosition: 0,
        }
      case 'min':
        return {
          code: formatter(`SELECT min(${node.title}) FROM ${parent.title};`),
          cursorPosition: 0,
        }
      case 'where<':
        return {
          code: formatter(
            `SELECT * FROM ${parent.title} WHERE ${parent.timeIndexName} <  ORDER BY ${parent.timeIndexName} DESC LIMIT 100;`
          ),
          cursorPosition: 26 + parent.timeIndexName.length,
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
