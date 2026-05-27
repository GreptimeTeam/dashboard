/**
 * Design tokens for the Perses dashboard iframe.
 * Colors and fonts are aligned with the GreptimeDB design system (global.less / arco-theme.less).
 */
const DASHBOARD_TOKENS = {
  colors: {
    // --gpt-main-purple
    brand: '#702fed',
    // --gpt-nav-active-bg
    brandHover: 'rgba(112, 47, 237, 0.1)',
    brandActive: 'rgba(112, 47, 237, 0.1)',
    brandBase: 'rgba(112, 47, 237, 0.04)',
    // @btn-primary-color-border
    brandBorder: 'rgba(112, 47, 237, 0.25)',
    brandBorderFocus: 'rgba(112, 47, 237, 0.5)',
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
    noData: '#b0a8c4',
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
  },
}

export default DASHBOARD_TOKENS
