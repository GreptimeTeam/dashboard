import type { Components, Theme } from '@mui/material/styles'
import DASHBOARD_TOKENS from '../Dashboard.styles'

/** --gpt-nav-active-bg / menu & table row active tint */
const toolbarTitleRowBg = DASHBOARD_TOKENS.colors.brandHover

// Save (contained) only renders in the title row while Perses is in edit mode.
const toolbarTitleRowEditSelector =
  '&[data-testid="dashboard-toolbar"] > .MuiBox-root:first-of-type:has(.MuiButton-contained)'

/**
 * Perses DashboardToolbar paints the title row in edit mode with
 * `theme.palette.primary.main + '30'` (e.g. #47346030). Override via parent Stack
 * selector so we outrank the child Box `sx` background.
 */
export function getPersesDashboardComponents(): Components<Omit<Theme, 'components'>> {
  return {
    MuiStack: {
      styleOverrides: {
        root: {
          [toolbarTitleRowEditSelector]: {
            backgroundColor: `${toolbarTitleRowBg} !important`,
          },
        },
      },
    },
  }
}

export default function getPersesDashboardLayoutStyles(): Record<string, Record<string, unknown>> {
  return {
    '[data-testid="dashboard-toolbar"] > .MuiBox-root:first-of-type:has(.MuiButton-contained)': {
      backgroundColor: `${toolbarTitleRowBg} !important`,
    },
    // StatChartPanel only — table StatChart columns keep 14px via MuiTypography theme
    '.MuiCardContent-root': {
      containerType: 'size',
    },
    '.MuiCardContent-root > .MuiStack-root .MuiTypography-h3': {
      fontSize: `${DASHBOARD_TOKENS.fonts.statChartValueFontSize} !important`,
    },
  }
}
