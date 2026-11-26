import { describe, expect, it } from 'vitest'
import { legendSoloSelected, toggleLegendSolo } from './legend-solo'

describe('toggleLegendSolo', () => {
  it('shows only the clicked series, then clears when that series is clicked again', () => {
    expect(toggleLegendSolo(null, 'error')).toBe('error')
    expect(toggleLegendSolo('error', 'error')).toBeNull()
  })

  it('switches solo to the newly clicked series', () => {
    expect(toggleLegendSolo('error', 'info')).toBe('info')
  })
})

describe('legendSoloSelected', () => {
  it('returns undefined when every series should stay visible', () => {
    expect(legendSoloSelected(['info', 'error'], null)).toBeUndefined()
  })

  it('selects only the solo series', () => {
    expect(legendSoloSelected(['info', 'error'], 'error')).toEqual({ info: false, error: true })
  })
})
