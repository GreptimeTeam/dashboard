<template lang="pug">
a-dropdown.menu-dropdown(trigger="click" position="right")
  a-button.menu-button(type="text" @click="(event) => clickMenu(event, nodeData)")
    template(#icon)
      svg.icon-14.rotate-90
        use(href="#extra")
  template(#content)
    a-doption(
      :class="nodeData.childrenType === 'columns' && expandedKeys?.includes(nodeData.key) ? 'selected' : 'icon-color'"
    )
      a-button(type="text" size="small" @click="(event) => expandChildren(event, nodeData, 'columns')")
        template(#icon)
          svg.icon
            use(href="#columns")
        | {{ $t('dashboard.columns') }}
    a-doption(
      :class="nodeData.childrenType === 'details' && expandedKeys?.includes(nodeData.key) ? 'selected' : 'icon-color'"
    )
      a-popover(position="right" :content="$t('dashboard.hints.details')")
        a-button(type="text" size="small" @click="(event) => expandChildren(event, nodeData, 'details')")
          template(#icon)
            svg.icon
              use(href="#details")
          | {{ $t('dashboard.details') }}
    a-doption(click.stop)
      a-space(v-for="item of SHORTCUT_MAP['TABLE']") 
        ShortCut(
          icon
          :type="item.value"
          :node="nodeData"
          :parent="nodeData.iconType ? expandedTablesTree[nodeData.parentKey] : nodeData"
          :label="'Quick select'"
          :database="database"
        )
    a-doption
      a-popover(content="Copy to Clipboard" position="right")
        a-button(type="text" size="small" @click="copy(nodeData.title)")
          template(#icon)
            svg.icon.icon-color(v-if="copied === false")
              use(href="#copy-new")
            svg.icon(v-else)
              icon-check.success-color
          | Copy name
</template>

<script lang="ts" setup name="TableMenu">
  import type { TableTreeParent } from '@/store/modules/database/types'
  import type { OptionsType } from '@/types/global'
  import { useClipboard } from '@vueuse/core'

  const props = defineProps<{
    nodeData: TableTreeParent
    expandedKeys: number[]
    expandedTablesTree: TableTreeParent[]
    database: string
  }>()
  const emits = defineEmits(['expandChildren'])
  const source = ref('')
  const { copy, copied } = useClipboard({ source })

  const expandChildren = (event: MouseEvent, nodeData: TableTreeParent, childrenType: string) => {
    event.stopPropagation()
    emits('expandChildren', event, nodeData, childrenType)
  }

  const SHORTCUT_MAP: { [key: string]: OptionsType[] } = {
    TABLE: [{ value: 'select*100', label: 'Query table' }],
  }

  const clickMenu = (event: MouseEvent, nodeData: TableTreeParent) => {
    if (props.expandedKeys.includes(nodeData.key)) {
      event.stopPropagation()
    }
  }
</script>

<style lang="less" scoped>
  :deep(.arco-btn-text[type='button']) {
    color: var(--main-font-color);
    border-radius: 0;
    width: 100%;
    justify-content: flex-start;
    padding: 0 28px 0 12px;
  }
  .arco-dropdown-option {
    .arco-dropdown-option-content {
      .arco-btn-text[type='button'] {
        svg {
          color: var(--small-font-color);
        }
      }
    }
    &.selected {
      .arco-dropdown-option-content {
        .arco-btn-text[type='button'] {
          color: var(--brand-color);
          svg {
            color: var(--brand-font-color);
          }
        }
      }
    }
  }

  .menu-button {
    display: none;
  }

  .arco-btn.arco-dropdown-open {
    display: flex;
    background: var(--list-hover-color);
  }

  .icon-14 {
    width: 14px;
    height: 14px;
  }

  :deep(.query-icon) {
    width: 14px;
    height: 14px;
  }
</style>
