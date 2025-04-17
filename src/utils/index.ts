import dayjs from 'dayjs'
import { format as sqlFormat } from 'sql-formatter'

type TargetContext = '_self' | '_parent' | '_blank' | '_top'

const units = ['', 'K', 'M', 'G', 'T', 'P', 'E', 'Z', 'Y']
const PLACES = 15
const FIXED = 2

export const openWindow = (url: string, opts?: { target?: TargetContext; [key: string]: any }) => {
  const { target = '_blank', ...others } = opts || {}
  window.open(
    url,
    target,
    Object.entries(others)
      .reduce((preValue: string[], curValue) => {
        const [key, value] = curValue
        return [...preValue, `${key}=${value}`]
      }, [])
      .join(',')
  )
}

export const importFiles = (file: any) => {
  return new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.src = file
    script.type = 'text/javascript'
    script.defer = true
    document.getElementsByTagName('head').item(0)?.appendChild(script)

    script.onload = () => {
      resolve(script)
    }
    script.onerror = () => {
      reject()
    }
  })
}
export const regexUrl = new RegExp(
  '^(?!mailto:)(?:(?:http|https|ftp)://)(?:\\S+(?::\\S*)?@)?(?:(?:(?:[1-9]\\d?|1\\d\\d|2[01]\\d|22[0-3])(?:\\.(?:1?\\d{1,2}|2[0-4]\\d|25[0-5])){2}(?:\\.(?:[0-9]\\d?|1\\d\\d|2[0-4]\\d|25[0-4]))|(?:(?:[a-z\\u00a1-\\uffff0-9]+-?)*[a-z\\u00a1-\\uffff0-9]+)(?:\\.(?:[a-z\\u00a1-\\uffff0-9]+-?)*[a-z\\u00a1-\\uffff0-9]+)*(?:\\.(?:[a-z\\u00a1-\\uffff]{2,})))|localhost)(?::\\d{2,5})?(?:(/|\\?|#)[^\\s]*)?$',
  'i'
)

export const dateFormatter = (dataType: string, value: number | null) => {
  switch (dataType) {
    case 'Date':
      return value && dayjs(0).add(value, 'day').format('YYYY-MM-DD HH:mm:ss')
    case 'TimestampSecond':
      return value && dayjs.unix(value).format('YYYY-MM-DD HH:mm:ss')
    case 'DateTime':
    case 'TimestampMillisecond':
      return value && dayjs(value).format('YYYY-MM-DD HH:mm:ss')
    case 'TimestampMicrosecond':
      return value && dayjs(value / 1000).format('YYYY-MM-DD HH:mm:ss')
    case 'TimestampNanosecond':
      return value && dayjs(value / 1000000).format('YYYY-MM-DD HH:mm:ss')
    default:
      return null
  }
}

export const sqlFormatter = (code: string) => {
  try {
    const trimmed = code.trim()
    const isInsert = /^INSERT\s+INTO/i.test(trimmed)
    let formatted

    try {
      formatted = sqlFormat(trimmed, {
        language: 'postgresql',
        keywordCase: 'preserve',
        expressionWidth: isInsert ? 160 : 80, // Higher value for INSERT to avoid breaking VALUES
      })

      // Special post-processing for INSERT statements to keep VALUES on single line
      if (isInsert) {
        // Regex to find multi-line value groups and make them single line
        formatted = formatted.replace(
          /\(\s+(['"][^'"]*['"]|[^,)]+)\s*,\s*(['"][^'"]*['"]|[^,)]+)\s*(?:,\s*(['"][^'"]*['"]|[^,)]+)\s*)*\)/g,
          (match) => {
            // Convert newlines and excess spaces to a single space within the value group
            return match.replace(/\s+/g, ' ')
          }
        )
      }
      formatted = formatted.endsWith(';') ? formatted : `${formatted};`

      // Add ONE newline after semicolons (not at the end)
      formatted = formatted.replace(/;(?!$)/g, ';\n')
      formatted = formatted.replace(/\n\s*\n/g, '\n\n')
    } catch (formattingError) {
      console.warn(`Failed to format SQL statement: ${formattingError}`)
      formatted = trimmed.endsWith(';') ? trimmed : `${trimmed};`
    }

    return formatted
  } catch (error) {
    console.error('SQL formatting error:', error)
    return code
  }
}

// TODO: perhaps a better function
export const groupByToMap = <T, Q>(array: T[], predicate: (value: T, index: number, array2: T[]) => Q) =>
  array.reduce((map, value, index, array2) => {
    const key = predicate(value, index, array2)
    const collection = map.get(key)
    if (!collection) {
      map.set(key, [value])
    } else {
      collection.push(value)
    }
    return map
  }, new Map<Q, T[]>())

export const getIconUrl = (iconName: string) => new URL(`/src/assets/images/${iconName}.png`, import.meta.url).href

export default null
