import { h, type VNode } from 'vue'
import { Dropdown, Doption } from '@arco-design/web-vue'
import i18n from '@/locale'
import type { ColumnType } from '@/types/query'
import { isJsonDataType, stringifyJsonForDisplay } from '@/utils/json-display'
import getCellString from '../utils/cell-text'

export function getSemanticThClass(column: ColumnType): string {
  return column.semantic_type?.toLowerCase() || ''
}

export function renderSemanticHeader(column: ColumnType): VNode {
  return h('span', { class: ['gpt-semantic-th', getSemanticThClass(column)] }, [
    h('span', { class: 'gpt-semantic-th-text' }, column.title || column.name),
  ])
}

export function renderJsonHeader(
  column: ColumnType,
  options: {
    hideNulls: boolean
    onToggleHideNulls: () => void
  }
): VNode {
  return h('span', { class: ['gpt-semantic-th', 'json-column-th', getSemanticThClass(column)] }, [
    h('span', { class: 'gpt-semantic-th-text' }, column.title || column.name),
    h(
      Dropdown,
      {
        trigger: 'click',
        position: 'bl',
        popupMaxHeight: false,
        onSelect: (value: string | number | Record<string, unknown>) => {
          if (String(value) === 'toggle-hide-nulls') {
            options.onToggleHideNulls()
          }
        },
      },
      {
        default: () =>
          h(
            'span',
            {
              class: 'json-column-th-action',
              title: i18n.global.t('dashboard.jsonColumnActions'),
              onClick: (event: MouseEvent) => event.stopPropagation(),
            },
            [h('svg', { class: 'icon-12' }, [h('use', { href: '#down' })])]
          ),
        content: () =>
          h(
            Doption,
            { value: 'toggle-hide-nulls' },
            {
              default: () =>
                h('div', { class: 'json-column-menu-item' }, [
                  h('span', i18n.global.t('dashboard.hideJsonNulls')),
                  options.hideNulls ? h('span', { class: 'json-column-menu-check' }, '✓') : null,
                ]),
            }
          ),
      }
    ),
  ])
}

export function formatCellText(value: unknown, column: ColumnType | null | undefined, hideJsonNulls = true): string {
  if (column && isJsonDataType(column.data_type)) {
    return stringifyJsonForDisplay(value, { hideNulls: hideJsonNulls })
  }
  return getCellString(value)
}

export function formatCellTextForCopy(
  value: unknown,
  column: ColumnType | null | undefined,
  hideJsonNulls = true
): string {
  if (column && isJsonDataType(column.data_type)) {
    return stringifyJsonForDisplay(value, { hideNulls: hideJsonNulls, pretty: true })
  }
  if (typeof value === 'object' && value !== null) {
    try {
      return JSON.stringify(value, null, 2)
    } catch {
      return '[Unsupported Object]'
    }
  }
  return getCellString(value)
}
