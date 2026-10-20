import { describe, expect, it } from 'vitest'
import en from './en-US'
import zh from './zh-CN'
import ja from './ja-JP'

const dictionaries: Record<string, Record<string, unknown>> = {
  'en-US': en,
  'zh-CN': zh,
  'ja-JP': ja,
}

const enKeys = Object.keys(en).sort()

describe('locale dictionaries', () => {
  it.each(Object.keys(dictionaries))('%s has the same keys as en-US', (locale) => {
    const keys = Object.keys(dictionaries[locale]).sort()
    expect(keys).toEqual(enKeys)
  })
})
