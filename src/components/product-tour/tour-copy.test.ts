import { describe, expect, it } from 'vitest'
import enTour from '@/locale/en-US/tour'
import jaTour from '@/locale/ja-JP/tour'
import zhTour from '@/locale/zh-CN/tour'
import { TOUR_STEPS, type TourStep } from './tour-steps'

/**
 * Copy contract for Zone B (`points`):
 * 1. no query token — a lead/detail must not reuse anything Zone A already shows;
 * 2. a lead is a short label (unique within the step), the detail is one sentence;
 * 3. budgets are measured in characters for the narrowest docked panel (400px).
 */
const MESSAGES = { 'en-US': enTour, 'zh-CN': zhTour, 'ja-JP': jaTour } as const
type Locale = keyof typeof MESSAGES

const BUDGET: Record<Locale, { lead: number; detail: number }> = {
  'en-US': { lead: 22, detail: 90 },
  'zh-CN': { lead: 10, detail: 48 },
  'ja-JP': { lead: 14, detail: 60 },
}

/**
 * Words that are not query tokens even though Zone A contains them: product
 * surfaces (SQL, OTLP) and SQL keywords that read as ordinary prose.
 */
const NOT_TOKENS = new Set([
  'sql',
  'promql',
  'tql',
  'otlp',
  'and',
  'as',
  'by',
  'case',
  'count',
  'desc',
  'else',
  'from',
  'group',
  'in',
  'interval',
  'limit',
  'minutes',
  'now',
  'or',
  'order',
  'sum',
  'then',
  'when',
  'where',
  'within',
])

const PROSE_STEPS = TOUR_STEPS.filter((step) => !step.action)

/** Everything Zone A renders next to the prose: the code or the preset rows. */
function zoneA(step: TourStep): string {
  return [step.code ?? '', ...(step.preset?.filters ?? []), step.preset?.sort ?? ''].join('\n')
}

/** Identifiers (columns, functions, status literals, keywords) visible in Zone A. */
function zoneAIdentifiers(step: TourStep): Set<string> {
  const tokens =
    zoneA(step)
      .toLowerCase()
      .match(/[a-z_][a-z0-9_.]{2,}/g) ?? []
  return new Set(tokens.filter((token) => !NOT_TOKENS.has(token)))
}

function latinWords(text: string): string[] {
  return (text.toLowerCase().match(/[a-z][a-z0-9_.]*/g) ?? []).filter((word) => word.length > 1)
}

function pointsOf(locale: Locale, step: TourStep) {
  const messages = MESSAGES[locale]
  const key = step.nameKey.replace(/\.name$/, '')
  return [0, 1, 2]
    .map((index) => ({
      index,
      lead: messages[`${key}.points.${index}.lead`],
      detail: messages[`${key}.points.${index}.detail`],
    }))
    .filter((point) => point.lead && !point.lead.startsWith('tour.'))
}

describe('tour Zone B copy', () => {
  it('does not restate anything Zone A already shows', () => {
    ;(Object.keys(MESSAGES) as Locale[]).forEach((locale) => {
      PROSE_STEPS.forEach((step) => {
        const surface = zoneA(step)
        const identifiers = zoneAIdentifiers(step)
        pointsOf(locale, step).forEach((point) => {
          const where = `${locale} ${step.id} points.${point.index}`

          expect(surface, `${where}.lead copies the query: ${point.lead}`).not.toContain(point.lead)

          const reused = [...latinWords(point.lead), ...latinWords(point.detail)].filter((word) =>
            identifiers.has(word)
          )
          expect(reused, `${where} reuses query tokens: ${reused.join(', ')}`).toEqual([])
        })
      })
    })
  })

  it('uses unique short labels and one sentence per point', () => {
    ;(Object.keys(MESSAGES) as Locale[]).forEach((locale) => {
      const budget = BUDGET[locale]
      PROSE_STEPS.forEach((step) => {
        const points = pointsOf(locale, step)
        expect(points.length, `${locale} ${step.id} has too few points`).toBeGreaterThanOrEqual(2)

        const leads = points.map((point) => point.lead)
        expect(new Set(leads).size, `${locale} ${step.id} repeats a lead`).toBe(leads.length)

        points.forEach((point) => {
          const where = `${locale} ${step.id} points.${point.index}`
          expect(point.lead.length, `${where}.lead is too long`).toBeLessThanOrEqual(budget.lead)
          expect(point.detail.length, `${where}.detail is too long`).toBeLessThanOrEqual(budget.detail)
        })
      })
    })
  })
})
