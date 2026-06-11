import '@mui/material/styles'

declare module '@mui/material/styles' {
  interface Palette {
    gpt: {
      table: {
        headBg: string
        rowHoverBg: string
        cellHoverBg: string
        bodyBg: string
        columnDivider: string
        border: string
        borderStrong: string
        focusOutline: string
      }
    }
  }

  interface PaletteOptions {
    gpt?: {
      table?: Partial<Palette['gpt']['table']>
    }
  }
}

export {}
