/**
 * Design tokens for the Perses dashboard iframe.
 * Colors and fonts are aligned with the GreptimeDB design system (global.less / arco-theme.less).
 */
const DASHBOARD_TOKENS = {
  colors: {
    // --gpt-main-dark / --gpt-control-accent
    controlAccent: '#473460',
    // --gpt-control-accent-hover / --gpt-main-purple
    controlAccentHover: '#702fed',
    // --gpt-control-accent-active / --gpt-brand-primary-hover
    controlAccentActive: '#5519c4',
    // --gpt-border-strong
    controlBorder: 'rgba(71, 52, 96, 0.15)',
    // --gpt-nav-active-bg — dataView.less .arco-table-hover row/cell hover
    tableRowHoverBg: 'rgba(112, 47, 237, 0.1)',
    // Opaque blends on #fff — table tr/td stack alpha; use solids to avoid double tint
    tableHeadBgSolid: '#f7f7f9', // --gpt-table-head-bg on white
    tableRowHoverBgSolid: '#f3eaf9', // tableRowHoverBg on white
    tableCellHoverBgSolid: '#ebe0f7', // deeper hover for expanded/truncated cell
    // Toolbar / panel hovers (same tint as table row hover)
    brandHover: 'rgba(112, 47, 237, 0.1)',
    brandBase: 'rgba(112, 47, 237, 0.04)',
    // --gpt-main-dark
    textPrimary: '#473460',
    // --gpt-text-secondary
    textSecondary: '#8b7ba8',
    // --gpt-text-muted
    textMuted: '#b0a8c4',
    // --gpt-border-subtle
    divider: 'rgba(71, 52, 96, 0.05)',
    // --gpt-border-default
    dividerDark: 'rgba(71, 52, 96, 0.09)',
    background: '#fafafa',
    // --gpt-bg-panel
    paper: '#ffffff',
    // --gpt-table-head-bg
    tableHeadBg: 'rgba(71, 52, 96, 0.04)',
    noData: '#b0a8c4',
    // --gpt-accent-ts (normal/healthy)
    normal: '#00bbb2',
    // --gpt-color-warning
    warning: '#FDD254',
  },
  shadows: {
    soft: '0 1px 2px 0 rgba(71, 52, 96, 0.06)',
    hover: '0 6px 16px rgba(112, 47, 237, 0.08), 0 1px 2px rgba(112, 47, 237, 0.04)',
  },
  fonts: {
    // --font-mono
    mono: "'Google Sans Code', monospace",
    // --font-family-base
    sans: "Geist, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    weightMedium: 500,
    // Standalone StatChart: Perses default ≈ 75cqh; use ~50% panel height instead
    statChartValueFontSize: 'clamp(16px, 50cqh, 40px)',
  },
}

export default DASHBOARD_TOKENS
