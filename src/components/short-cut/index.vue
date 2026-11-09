<template lang="pug">
a-tooltip(position="right" :content="getCodeInfo().code")
  a-button.short-cut-btn(
    type="text"
    size="small"
    :class="{ 'arco-btn-only-icon': label === '' }"
    :loading="isLoading"
    @click="clickShortCut"
    @mouseenter="hoverQuickSelect(node)"
  ) {{ label }}
    template(v-if="icon" #icon)
      svg.icon-14.icon-color
        use(href="#query")
</template>

<script lang="ts" setup name="ShortCut">
  import useSiderTabs from '@/hooks/sider-tabs'
  import type { TableTreeParent, TreeChild } from '@/store/modules/database/types'

  const props = defineProps<{
    label: string
    type: string
    node: TreeChild
    parent: TableTreeParent
    database: string
    icon?: boolean
  }>()

  const { inputFromNewLineToQueryCode } = useQueryCode()
  const { loadMoreColumns } = useSiderTabs()

  const isLoading = ref(false)

  const formatter = (code: string) => {
    // No format for now.
    return code
  }

  const hoverQuickSelect = async (nodeData: TableTreeParent) => {
    if (nodeData.isLeaf) {
      return
    }
    if (nodeData.columns.length) {
      return
    }
    isLoading.value = true
    await loadMoreColumns(nodeData, false, props.database)
    isLoading.value = false
  }

  const getCodeAndCursorPos = (type: string, node: TreeChild, parent: TableTreeParent) => {
    const timeIndexName = parent.timeIndexName && parent.timeIndexName !== '%TIMESTAMP%' ? parent.timeIndexName : ''
    const orderBy = timeIndexName ? ` ORDER BY "${timeIndexName}" ` : ' '
    switch (type) {
      case 'select*100':
        return {
          code: formatter(`SELECT * FROM ${props.database}."${parent.title}"${orderBy}DESC LIMIT 100;`),
          cursorPosition: 0,
        }
      case 'count':
        return {
          code: formatter(`SELECT count(*) FROM ${props.database}."${parent.title}" GROUP BY "${node.title}";`),
          cursorPosition: 0,
        }
      case 'where=':
        return {
          code: formatter(`SELECT * FROM ${props.database}."${parent.title}" WHERE "${node.title}" = ${orderBy}DESC;`),
          cursorPosition: `${orderBy}DESC;`.length,
        }
      case 'select100':
        return {
          code: formatter(`SELECT "${node.title}" FROM ${props.database}."${parent.title}"${orderBy}DESC LIMIT 100;`),
          cursorPosition: 0,
        }
      case 'max':
        return {
          code: formatter(`SELECT max("${node.title}") FROM ${props.database}."${parent.title}";`),
          cursorPosition: 0,
        }
      case 'min':
        return {
          code: formatter(`SELECT min("${node.title}") FROM ${props.database}."${parent.title}";`),
          cursorPosition: 0,
        }
      case 'where<':
        return {
          code: formatter(
            `SELECT * FROM ${props.database}."${parent.title}" WHERE "${
              timeIndexName || node.title
            }" < ${orderBy}DESC LIMIT 100;`
          ),
          cursorPosition: `${orderBy}DESC LIMIT 100;`.length,
        }
      default:
        return {
          code: '',
          cursorPosition: 0,
        }
    }
  }

  /**
   * Build the SQL at click time and make sure the table's time index is known.
   * Tree nodes are stored in a shallowRef (no per-node reactivity), so a
   * computed that captured `timeIndexName` before columns were loaded would
   * stay stale and produce `ORDER BY ""`.
   */
  // Build lazily: tree nodes live in a shallowRef, so a computed would cache
  // `timeIndexName` captured before columns were loaded.
  const getCodeInfo = () => getCodeAndCursorPos(props.type, props.node, props.parent)

  const clickShortCut = async () => {
    if (!props.parent) return
    if (!props.parent.timeIndexName && !props.parent.columns?.length) {
      isLoading.value = true
      try {
        await loadMoreColumns(props.parent, true, props.database)
      } catch {
        // fall back to no ORDER BY
      } finally {
        isLoading.value = false
      }
    }
    const info = getCodeInfo()
    inputFromNewLineToQueryCode(info.code, info.cursorPosition)
  }
</script>

<style lang="less" scoped>
  .short-cut-btn.arco-btn-text[type='button'] {
    color: var(--main-font-color);
    font-weight: 400;
    font-size: 13px;

    :deep(.arco-btn-icon svg),
    :deep(svg) {
      color: var(--gpt-icon-color);
    }
  }
</style>
