import { h, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { Tooltip } from '@arco-design/web-vue'
import { useDateTimeFormat } from '@/hooks'
import type { ColumnType, TSColumn } from '@/types/query'
import getCellString from '../utils/cell-text'

/**
 * Timestamp display state: formatted (timezone-aware) vs raw value.
 * The toggle lives in the column header pill and applies to every time column.
 */
export default function useLogsTimeFormat() {
  const { t } = useI18n()
  const { formatDateTimeWithMs } = useDateTimeFormat()

  /** true = formatted timestamp, false = raw value (legacy `tsViewStr`). */
  const tsViewStr = ref(true)

  /**
   * Time cell text. `formatted` follows the header toggle: raw value when off,
   * timezone-aware string when on (legacy `renderTs` + `changeTsView`).
   */
  function formatTsDisplay(
    value: unknown,
    column: ColumnType | TSColumn | null | undefined,
    formatted = tsViewStr.value
  ): string {
    if (value == null || value === '') {
      return ''
    }
    const raw = getCellString(value)
    if (!formatted || !column || !('data_type' in column) || !column.data_type) {
      return raw
    }
    return formatDateTimeWithMs(value as number, column.data_type) || raw
  }

  function changeTsView() {
    tsViewStr.value = !tsViewStr.value
  }

  /** Header pill for time columns — icon + name, click toggles raw/formatted. */
  function renderTsHeader(title: string) {
    return h(
      Tooltip,
      { placement: 'top' },
      {
        content: () => t(tsViewStr.value ? 'dashboard.showTimestamp' : 'dashboard.formatTimestamp'),
        default: () =>
          h('span', { class: ['gpt-semantic-th', 'timestamp', 'logs-vxe-ts-th'], onClick: changeTsView }, [
            h('svg', { class: 'icon-12' }, [h('use', { href: '#time-index' })]),
            h('span', { class: 'gpt-semantic-th-text' }, title),
          ]),
      }
    )
  }

  return { tsViewStr, formatTsDisplay, changeTsView, renderTsHeader }
}
