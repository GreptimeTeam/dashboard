<template lang="pug">
a-tooltip(:content="code")
  a-button(type="text" @click="inputFromNewLineToQueryCode(code)") {{ label }}
</template>

<script lang="ts" setup name="ShortCut">
  import type { TreeChild, TreeData } from '@/store/modules/database/types'
  import { format } from 'sql-formatter'

  const props = defineProps<{
    label: string
    type: string
    node: TreeChild
    parent: TreeData
  }>()

  const { inputFromNewLineToQueryCode } = useQueryCode()

  const formatter = (code: string) => {
    return format(code, { language: 'mysql', keywordCase: 'upper' })
  }

  const getShortcut = (type: string, node: TreeChild, parent?: TreeData) => {
    if (!parent) {
      parent = node
    }

    switch (type) {
      case 'select*100':
        return formatter(`SELECT * FROM ${parent.title} ORDER BY ${parent.timeIndexName} LIMIT 100;`)
      case 'count':
        return formatter(`SELECT count(*) FROM ${parent.title} GROUP BY ${node.title};`)
      case 'where=':
        return formatter(`SELECT * FROM ${parent.title} WHERE ${node.title} = ? ORDER BY ${parent.timeIndexName} DESC;`)
      case 'select100':
        return formatter(`SELECT ${node.title} FROM ${parent.title} ORDER BY ${parent.timeIndexName} DESC LIMIT 100;`)
      case 'max':
        return formatter(`SELECT max(${node.title}) FROM ${parent.title};`)
      case 'min':
        return formatter(`SELECT min(${node.title}) FROM ${parent.title};`)
      case 'where<':
        return formatter(
          `SELECT * FROM ${parent.title} WHERE ${parent.timeIndexName} < ? ORDER BY ${parent.timeIndexName} DESC LIMIT 100;`
        )
      default:
        return ''
    }
  }

  const code = computed(() => {
    return getShortcut(props.type, props.node, props.parent)
  })
</script>
