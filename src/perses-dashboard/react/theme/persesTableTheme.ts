import type { Components, Theme } from '@mui/material/styles'
import DASHBOARD_TOKENS from '../Dashboard.styles'

/** Table tokens aligned with global.less / dataView.less / data-table */
export function getGptTablePalette() {
  return {
    headBg: DASHBOARD_TOKENS.colors.tableHeadBgSolid,
    rowHoverBg: DASHBOARD_TOKENS.colors.tableRowHoverBgSolid,
    cellHoverBg: DASHBOARD_TOKENS.colors.tableCellHoverBgSolid,
    bodyBg: DASHBOARD_TOKENS.colors.paper,
    columnDivider: DASHBOARD_TOKENS.colors.controlBorder,
    border: DASHBOARD_TOKENS.colors.divider,
    borderStrong: DASHBOARD_TOKENS.colors.dividerDark,
    focusOutline: DASHBOARD_TOKENS.colors.controlBorder,
  }
}

/** Perses compact density uses body2 on #original-cell; StatChart columns use Typography h3 at 14px — align both. */
const tableBodyCellTypography = {
  fontSize: '14px !important',
  lineHeight: '20px !important',
} as const

/**
 * Perses hover expands #original-cell with position:absolute + fit-content (show ellipsized text).
 * Lock in-flow layout on default and hover so centered columns do not shift.
 */
const originalCellLayout = {
  position: 'relative !important',
  top: 'auto !important',
  left: 'auto !important',
  right: 'auto !important',
  zIndex: 'auto !important',
  width: '100% !important',
  minWidth: '0 !important',
  maxWidth: '100% !important',
  boxSizing: 'border-box !important',
  whiteSpace: 'nowrap !important',
  overflow: 'hidden !important',
  textOverflow: 'ellipsis !important',
  backgroundColor: 'inherit !important',
  outline: 'none !important',
  boxShadow: 'none !important',
  ...tableBodyCellTypography,
} as const

function tableBodyBg(theme: Theme) {
  return theme.palette.gpt.table.bodyBg
}

/**
 * MUI table overrides for Perses (@perses-dev/components Table).
 *
 * Prefer theme.components over GlobalStyles. `!important` is used only where Perses
 * TableRow/TableCell apply instance `sx` or styled() rules that outrank theme defaults.
 */
export function getPersesTableComponents(): Components<Omit<Theme, 'components'>> {
  return {
    MuiTable: {
      styleOverrides: {
        root: {
          borderCollapse: 'separate',
          backgroundColor: 'transparent',
        },
      },
    },
    MuiTableHead: {
      styleOverrides: {
        root: ({ theme }) => ({
          backgroundColor: theme.palette.gpt.table.headBg,
        }),
      },
    },
    MuiTableRow: {
      styleOverrides: {
        root: {
          'backgroundColor': 'transparent !important',
          'transition': 'background-color 0.2s ease',
          '&:hover': {
            // Perses TableRow sx tints tr — rows/cells stack alpha if both are tinted
            backgroundColor: 'transparent !important',
          },
        },
      },
    },
    MuiTableCell: {
      styleOverrides: {
        root: ({ theme }) => {
          const {
            palette: {
              gpt: { table },
            },
          } = theme
          return {
            'borderBottom': `1px solid ${table.border}`,
            'borderBottomColor': `${table.border} !important`,
            // StatChartPanel sets overflowX: auto on Stack; single-value cells don't scroll but still show a gutter.
            '& .MuiStack-root': {
              minHeight: 'auto',
              gap: 0,
              overflow: 'hidden !important',
            },
            '& #original-cell': originalCellLayout,
            '&:hover #original-cell': originalCellLayout,
            '&:focus-within #original-cell': originalCellLayout,
            // dataView.less: tint td on row hover (not tr)
            '.MuiTableBody-root .MuiTableRow-root:hover > &:not(.MuiTableCell-head):not(:hover)': {
              backgroundColor: `${table.rowHoverBg} !important`,
            },
            '.MuiTableBody-root .MuiTableRow-root:hover > &:not(.MuiTableCell-head):hover': {
              backgroundColor: `${table.cellHoverBg} !important`,
            },
          }
        },
        head: ({ theme }) => {
          const {
            palette: {
              gpt: { table },
              text: { secondary: textSecondary },
            },
          } = theme
          return {
            'backgroundColor': `${table.headBg} !important`,
            'color': textSecondary,
            'fontWeight': 600,
            'borderBottom': `1px solid ${table.borderStrong} !important`,
            'position': 'relative',
            'overflow': 'hidden',
            // data-table: .arco-table-th:not(:last-child)::after
            '&:not(:last-of-type)': {
              boxShadow: `inset -1px 0 0 ${table.columnDivider} !important`,
            },
            '&:has(.MuiTableSortLabel-root):hover': {
              backgroundColor: `${table.rowHoverBg} !important`,
            },
            '&:focus-visible': {
              outline: `1px solid ${table.focusOutline} !important`,
              outlineOffset: '-1px',
            },
          }
        },
        body: ({ theme }) => ({
          color: theme.palette.text.primary,
          backgroundColor: tableBodyBg(theme),
          overflow: 'hidden',
          position: 'relative',
        }),
      },
    },
    MuiTableSortLabel: {
      styleOverrides: {
        root: ({ theme }) => ({
          'color': theme.palette.text.secondary,
          'fontWeight': 600,
          '&:hover': {
            color: theme.palette.text.secondary,
          },
          '&.Mui-active': {
            color: theme.palette.text.secondary,
          },
        }),
        icon: ({ theme }) => ({
          color: theme.palette.text.secondary,
          opacity: 0.72,
        }),
      },
    },
  }
}

/** Beat Perses TableCell sx hover (#original-cell position:absolute) when theme injection order loses. */
export function getPersesTableGlobalStyles(): Record<string, Record<string, unknown>> {
  return {
    '.MuiTableCell-root.MuiTableCell-body > #original-cell': originalCellLayout,
    '.MuiTableCell-root.MuiTableCell-body:hover > #original-cell': originalCellLayout,
    '.MuiTableCell-root .MuiStack-root': {
      overflow: 'hidden !important',
    },
  }
}
