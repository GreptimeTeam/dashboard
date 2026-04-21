export const DASHBOARD_TOKENS = {
  colors: {
    brand: '#7c3aed',
    brandHover: 'rgba(124, 58, 237, 0.06)',
    brandActive: 'rgba(124, 58, 237, 0.1)',
    brandBase: 'rgba(124, 58, 237, 0.04)',
    brandBorder: 'rgba(124, 58, 237, 0.5)',
    brandBorderFocus: 'rgba(124, 58, 237, 0.6)',
    textPrimary: '#0f172a',
    textSecondary: '#475569',
    textMuted: '#64748b',
    divider: '#f1f5f9',
    dividerDark: '#e2e8f0',
    background: '#fcfcfc',
    paper: '#ffffff',
    noData: '#64748b',
  },
  shadows: {
    soft: '0 1px 2px 0 rgba(0, 0, 0, 0.03)',
    hover: '0 6px 16px rgba(124, 58, 237, 0.08), 0 1px 2px rgba(124, 58, 237, 0.04)',
  },
  fonts: {
    mono: "'JetBrains Mono', 'Roboto Mono', 'Menlo', 'Courier New', monospace",
    sans: "'Inter Variable', 'Inter', ui-sans-serif, system-ui, sans-serif, 'Apple Color Emoji', 'Segoe UI Emoji', 'Segoe UI Symbol', 'Noto Color Emoji'",
    weightMedium: 500,
  },
}

export const globalStyles = `
  html,
  body,
  #root,
  [data-reactroot] {
    background-color: ${DASHBOARD_TOKENS.colors.background} !important;
  }

  body {
    margin: 0 !important;
  }

  .MuiTypography-h3:not(.MuiTableCell-root *) {
    font-family: ${DASHBOARD_TOKENS.fonts.sans} !important;
    font-weight: 600 !important;;
    letter-spacing: -0.02em !important;
    font-feature-settings: 'tnum' 1 !important;
    color: ${DASHBOARD_TOKENS.colors.textPrimary} !important;
    display: flex !important;
    align-items: baseline !important;
    justify-content: center !important;
  }

  .MuiTypography-h3:not(.MuiTableCell-root *) :not(b):not(strong) {
    font-size: 0.55em !important;
    font-weight: 400 !important;
    color: ${DASHBOARD_TOKENS.colors.textSecondary} !important;
    margin-left: 4px !important;
    letter-spacing: 0 !important;
  }

  .MuiTableCell-root .MuiTypography-h3 {
    font-family: ${DASHBOARD_TOKENS.fonts.sans} !important;
    font-size: 14px !important;
    font-weight: ${DASHBOARD_TOKENS.fonts.weightMedium} !important;
    color: inherit !important;
    line-height: inherit !important;
    letter-spacing: 0 !important;
    padding: 0 !important;
    margin: 0 !important;
  }

  .MuiTableCell-root .MuiStack-root {
    min-height: auto !important;
    gap: 0 !important;
  }

  .MuiCardContent-root {
    display: flex !important;
    flex-direction: column !important;
    flex: 1 !important;
    overflow: hidden !important;
  }

  .MuiCardContent-root > .MuiStack-root {
    flex: 1 !important;
    height: 100% !important;
    min-height: 0 !important;
    overflow: visible !important;
  }

  .MuiCardContent-root > .MuiBox-root > .MuiBox-root {
    padding: 0 !important;
  }

  .MuiTypography-h6 {
    font-size: 14px !important;
    font-weight: 600 !important;
    color: ${DASHBOARD_TOKENS.colors.textSecondary} !important;
    margin-bottom: 16px !important;
    margin-top: 40px !important;
    display: flex;
    align-items: center;
    text-transform: none !important;
    letter-spacing: -0.01em !important;
  }
  .MuiTypography-h6::after {
    content: "";
    flex: 1;
    height: 1px;
    background: ${DASHBOARD_TOKENS.colors.dividerDark};
    margin-left: 12px;
  }

  .MuiTable-root {
    border-collapse: separate !important;
    background-color: transparent !important;
  }

  #original-cell,
  .MuiBox-root[id="original-cell"],
  .MuiTableCell-root:hover #original-cell,
  .MuiTableCell-root:hover .MuiBox-root[id="original-cell"] {
    background-color: transparent !important;
    background: transparent !important;
  }

  .MuiCardContent-root > .MuiBox-root:first-child > .MuiTableContainer-root[data-testid="virtuoso-scroller"] .MuiTableRow-root {
    background-color: transparent !important;
    transition: background-color 0.1s ease !important;
  }

  .MuiCardContent-root > .MuiBox-root:first-child > .MuiTableContainer-root[data-testid="virtuoso-scroller"] .MuiTableBody-root .MuiTableRow-root:hover {
    background-color: ${DASHBOARD_TOKENS.colors.brandHover} !important;
  }

  .MuiCardContent-root > .MuiBox-root:first-child > .MuiTableContainer-root[data-testid="virtuoso-scroller"] .MuiTableHead-root .MuiTableCell-root,
  .MuiCardContent-root > .MuiBox-root:first-child > .MuiTableContainer-root[data-testid="virtuoso-scroller"] .MuiTableBody-root .MuiTableCell-root {
    background-color: transparent !important;
  }

  .MuiCardContent-root > .MuiBox-root:first-child > .MuiTableContainer-root[data-testid="virtuoso-scroller"] .MuiTableBody-root .MuiTableRow-root:hover .MuiTableCell-root {
    background-color: transparent !important;
  }

  .MuiCardContent-root > .MuiBox-root:first-child > .MuiTableContainer-root[data-testid="virtuoso-scroller"] .MuiTableHead-root .MuiTableCell-root {
    border-top: none !important;
    border-bottom: 1px solid ${DASHBOARD_TOKENS.colors.divider} !important;
    padding: 6px 12px !important;
    transition: background-color 0.1s ease;
  }

  .MuiCardContent-root > .MuiBox-root:first-child > .MuiTableContainer-root[data-testid="virtuoso-scroller"] .MuiTableHead-root .MuiTableCell-root,
  .MuiCardContent-root > .MuiBox-root:first-child > .MuiTableContainer-root[data-testid="virtuoso-scroller"] .MuiTableHead-root .MuiTableCell-root .MuiTypography-root,
  .MuiCardContent-root > .MuiBox-root:first-child > .MuiTableContainer-root[data-testid="virtuoso-scroller"] .MuiTableHead-root .MuiTableCell-root .MuiTableSortLabel-root {
    color: ${DASHBOARD_TOKENS.colors.textSecondary} !important;
    font-weight: 500 !important;
    font-size: 14px !important;
    text-transform: none !important;
    letter-spacing: 0 !important;
  }

  .MuiCardContent-root > .MuiBox-root:first-child > .MuiTableContainer-root[data-testid="virtuoso-scroller"] .MuiTableBody-root .MuiTableCell-root {
    font-family: ${DASHBOARD_TOKENS.fonts.sans} !important;
    font-size: 14px !important;
    font-weight: 500 !important;
    border-bottom: 1px solid ${DASHBOARD_TOKENS.colors.divider} !important;
    padding: 12px 16px !important;
    height: auto !important;
    line-height: inherit !important;
    background-color: transparent !important;
  }

  .MuiCardContent-root > .MuiBox-root:first-child > .MuiTableContainer-root[data-testid="virtuoso-scroller"] .MuiTableCell-root #original-cell,
  .MuiCardContent-root > .MuiBox-root:first-child > .MuiTableContainer-root[data-testid="virtuoso-scroller"] .MuiTableCell-root .MuiBox-root[id="original-cell"] {
    height: auto !important;
    min-height: auto !important;
    line-height: inherit !important;
  }

  .MuiCardContent-root > .MuiBox-root:first-child > .MuiTableContainer-root[data-testid="virtuoso-scroller"] .MuiTableCell-root:hover #original-cell,
  .MuiCardContent-root > .MuiBox-root:first-child > .MuiTableContainer-root[data-testid="virtuoso-scroller"] .MuiTableCell-root:hover .MuiBox-root[id="original-cell"] {
    position: relative !important;
    top: auto !important;
    left: auto !important;
    z-index: auto !important;
    width: auto !important;
    min-width: auto !important;
    overflow: visible !important;
    background-color: transparent !important;
    outline: none !important;
    outline-offset: 0 !important;
    box-shadow: none !important;
  }

  .MuiTableCell-root div {
    line-height: inherit !important;
  }

  .MuiListItemText-root .MuiTypography-root {
    font-size: 11px !important;
    color: ${DASHBOARD_TOKENS.colors.textSecondary} !important;
  }

  .MuiStack-root [data-testid="virtuoso-scroller"],
  .MuiCardContent-root .MuiBox-root:not(:first-child) [data-testid="virtuoso-scroller"],
  .MuiCardContent-root .MuiStack-root [data-testid="virtuoso-scroller"] {
    flex: 1 !important;
    overflow-y: auto !important;
    display: block !important;
  }

  .MuiStack-root [data-testid="virtuoso-scroller"] table,
  .MuiCardContent-root .MuiBox-root:not(:first-child) [data-testid="virtuoso-scroller"] table,
  .MuiCardContent-root .MuiStack-root [data-testid="virtuoso-scroller"] table {
    border-spacing: 0 !important;
    border-collapse: separate !important;
    width: 100% !important;
  }

  .MuiStack-root [data-testid="virtuoso-scroller"] th,
  .MuiStack-root [data-testid="virtuoso-scroller"] td,
  .MuiCardContent-root .MuiBox-root:not(:first-child) [data-testid="virtuoso-scroller"] th,
  .MuiCardContent-root .MuiBox-root:not(:first-child) [data-testid="virtuoso-scroller"] td,
  .MuiCardContent-root .MuiStack-root [data-testid="virtuoso-scroller"] th,
  .MuiCardContent-root .MuiStack-root [data-testid="virtuoso-scroller"] td {
    font-size: 11px !important;
    padding: 0 8px !important;
    color: ${DASHBOARD_TOKENS.colors.textSecondary} !important;
    border-bottom: 1px solid ${DASHBOARD_TOKENS.colors.divider} !important;
    white-space: nowrap !important;
    height: 26px !important;
    line-height: 26px !important;
    box-sizing: border-box !important;
  }

  .MuiStack-root [data-testid="virtuoso-scroller"] th,
  .MuiCardContent-root .MuiBox-root:not(:first-child) [data-testid="virtuoso-scroller"] th,
  .MuiCardContent-root .MuiStack-root [data-testid="virtuoso-scroller"] th {
    background-color: ${DASHBOARD_TOKENS.colors.background} !important;
    font-weight: 600 !important;
    color: ${DASHBOARD_TOKENS.colors.textMuted} !important;
    border-bottom: none !important;
  }

  .MuiCardContent-root .MuiBox-root:not(:first-child) [data-testid="virtuoso-scroller"] td {
    border-bottom: none !important;
  }

  .MuiStack-root [data-testid="virtuoso-scroller"] th #original-cell,
  .MuiStack-root [data-testid="virtuoso-scroller"] th .MuiBox-root[id="original-cell"],
  .MuiStack-root [data-testid="virtuoso-scroller"] th .MuiTableSortLabel-root,
  .MuiCardContent-root .MuiBox-root:not(:first-child) [data-testid="virtuoso-scroller"] th #original-cell,
  .MuiCardContent-root .MuiBox-root:not(:first-child) [data-testid="virtuoso-scroller"] th .MuiBox-root[id="original-cell"],
  .MuiCardContent-root .MuiBox-root:not(:first-child) [data-testid="virtuoso-scroller"] th .MuiTableSortLabel-root,
  .MuiCardContent-root .MuiStack-root [data-testid="virtuoso-scroller"] th #original-cell,
  .MuiCardContent-root .MuiStack-root [data-testid="virtuoso-scroller"] th .MuiBox-root[id="original-cell"],
  .MuiCardContent-root .MuiStack-root [data-testid="virtuoso-scroller"] th .MuiTableSortLabel-root {
    height: 26px !important;
    min-height: 26px !important;
    padding: 0 !important;
    margin: 0 !important;
    display: flex !important;
    align-items: center !important;
  }

  .MuiStack-root [data-testid="virtuoso-scroller"] .MuiTableCell-root:hover .MuiBox-root[id="original-cell"],
  .MuiCardContent-root .MuiBox-root:not(:first-child) [data-testid="virtuoso-scroller"] .MuiTableCell-root:hover #original-cell,
  .MuiCardContent-root .MuiBox-root:not(:first-child) [data-testid="virtuoso-scroller"] .MuiTableCell-root:hover .MuiBox-root[id="original-cell"],
  .MuiCardContent-root .MuiStack-root [data-testid="virtuoso-scroller"] .MuiTableCell-root:hover #original-cell,
  .MuiCardContent-root .MuiStack-root [data-testid="virtuoso-scroller"] .MuiTableCell-root:hover .MuiBox-root[id="original-cell"] {
    position: relative !important;
    top: auto !important;
    left: auto !important;
    z-index: auto !important;
    width: auto !important;
    min-width: auto !important;
    overflow: hidden !important;
    background-color: transparent !important;
    outline: none !important;
    box-shadow: none !important;
  }

  .MuiTable-root:not([data-testid="virtuoso-scroller"] *) .MuiTableBody-root .MuiTableCell-root #original-cell,
  .MuiTable-root:not([data-testid="virtuoso-scroller"] *) .MuiTableBody-root .MuiTableCell-root .MuiBox-root[id="original-cell"] {
    height: auto !important;
    min-height: auto !important;
  }

  .MuiBox-root[style*="height"][style*="width"]:has(ul),
  .MuiBox-root[style*="height"][style*="width"]:has([role="list"]),
  .MuiBox-root[style*="height"][style*="width"]:has(table) {
    background-color: transparent !important;
  }

  .MuiBox-root[style*="height"][style*="width"] ul {
    overflow-y: auto !important;
    background-color: transparent !important;
  }

  .MuiListItem-root {
    background-color: transparent !important;
  }

  [data-testid="dashboard-toolbar"] {
    padding-bottom: 12px !important;
    border-bottom: 1px solid ${DASHBOARD_TOKENS.colors.dividerDark} !important;
    margin-bottom: 8px !important;
  }

  [data-testid="dashboard-toolbar"] .MuiButton-root,
  [data-testid="dashboard-toolbar"] .MuiIconButton-root {
    height: 100%;
  }

  [data-testid="dashboard-toolbar"] > .MuiBox-root:first-child {
    display: none !important;
  }

  body.dashboard-editable [data-testid="dashboard-toolbar"] > .MuiBox-root:first-child {
    display: flex !important;
  }

  [data-testid="panel-group-header"] {
    background-color: transparent !important;
    transition: background-color 0.2s ease;
    margin-bottom: 4px !important;
  }
  [data-testid="panel-group-header"]:hover {
    background-color: ${DASHBOARD_TOKENS.colors.brandHover} !important;
    border-radius: 4px;
  }

  [data-testid="panel-group-header"] .MuiTypography-root {
    font-weight: 600 !important;
    color: ${DASHBOARD_TOKENS.colors.textSecondary} !important;
    font-size: 14px !important;
  }

  [data-testid="variable-list"] {
    display: flex;
    gap: 12px;
    align-items: center;
  }

  .MuiButton-root, .MuiIconButton-root {
    border-color: ${DASHBOARD_TOKENS.colors.dividerDark} !important;
    transition: all 0.2s ease !important;
  }

  [data-testid="variable-list"] button:hover,
  [data-testid="dashboard-toolbar"] button:hover,
  .MuiButton-root:hover,
  .MuiIconButton-root:hover {
    border-color: ${DASHBOARD_TOKENS.colors.brandBorder} !important;
    background-color: ${DASHBOARD_TOKENS.colors.brandHover} !important;
    color: ${DASHBOARD_TOKENS.colors.brand} !important;
  }

  .MuiOutlinedInput-root .MuiOutlinedInput-notchedOutline {
    border-color: ${DASHBOARD_TOKENS.colors.dividerDark} !important;
    transition: border-color 0.2s ease, box-shadow 0.2s ease;
  }
  .MuiOutlinedInput-root:hover:not(.Mui-focused) .MuiOutlinedInput-notchedOutline {
    border-color: ${DASHBOARD_TOKENS.colors.brandBorder} !important;
  }
  .MuiOutlinedInput-root.Mui-focused .MuiOutlinedInput-notchedOutline {
    border-color: ${DASHBOARD_TOKENS.colors.brandBorderFocus} !important;
    box-shadow: 0 0 0 3px rgba(124, 58, 237, 0.08);
  }
  .MuiOutlinedInput-root.Mui-focused,
  .MuiSelect-select:focus,
  .MuiInputBase-root:has(.MuiSelect-select:focus) {
    background-color: ${DASHBOARD_TOKENS.colors.brandBase} !important;
  }

  .MuiInputLabel-root {
    font-size: 11px !important;
    color: ${DASHBOARD_TOKENS.colors.textSecondary} !important;
    text-transform: uppercase !important;
    letter-spacing: 0.02em !important;
  }
  .MuiInputLabel-root.Mui-focused {
    color: ${DASHBOARD_TOKENS.colors.brand} !important;
  }

  .MuiSelect-select.MuiInputBase-input {
    background-color: transparent !important;
  }

  .MuiChip-root {
    background-color: ${DASHBOARD_TOKENS.colors.brandHover} !important;
    border-radius: 4px !important;
    height: 24px !important;
  }
  .MuiChip-label {
    font-family: ${DASHBOARD_TOKENS.fonts.mono} !important;
    font-size: 11px !important;
  }

  [class*="noData"], [class*="NoData"],
  .MuiBox-root:has(> svg[data-testid*="NoData"]) + .MuiTypography-root,
  .MuiBox-root:has(> svg[data-testid*="no-data"]) + .MuiTypography-root,
  .MuiStack-root > .MuiTypography-root:only-child,
  .MuiStack-root:has(> .MuiTypography-root:only-child) .MuiTypography-root {
     color: ${DASHBOARD_TOKENS.colors.textMuted} !important;
     font-size: 13px !important;
     font-weight: 500 !important;
     opacity: 1.0 !important;
  }

  .MuiBox-root:has(> svg) svg,
  svg[class*="NoData"],
  svg[data-testid*="NoData"],
  svg[data-testid*="no-data"] {
    opacity: 0.3 !important;
    transform: scale(0.8) !important;
    color: ${DASHBOARD_TOKENS.colors.noData} !important;
    fill: ${DASHBOARD_TOKENS.colors.noData} !important;
  }

  .MuiAppBar-root {
    border: none !important;
    box-shadow: none !important;
    background-color: transparent !important;
    border-bottom: none !important;
  }
  .MuiAppBar-root.mui-fixed {
    background-color: rgba(248, 250, 252, 0.9) !important;
    backdrop-filter: blur(8px) !important;
    border-bottom: 1px solid ${DASHBOARD_TOKENS.colors.dividerDark} !important;
  }

  .MuiAppBar-root .MuiOutlinedInput-root.Mui-focused,
  .MuiAppBar-root .MuiSelect-select:focus,
  .MuiAppBar-root .MuiInputBase-root:has(.MuiSelect-select:focus) {
    background-color: ${DASHBOARD_TOKENS.colors.paper} !important;
  }

  .MuiAppBar-root .MuiChip-root {
    background-color: ${DASHBOARD_TOKENS.colors.paper} !important;
  }

  .MuiCardHeader-root .MuiCardHeader-title .MuiTypography-root,
  .MuiCardHeader-root .MuiTypography-root,
  .MuiTypography-subtitle1[id$="-title"] {
    color: ${DASHBOARD_TOKENS.colors.textSecondary} !important;
    font-size: 13px !important;
    font-weight: 600 !important;
    letter-spacing: 0.01em !important;
    line-height: 1.4 !important;
    min-height: auto !important;
    text-transform: none !important;
  }
`
