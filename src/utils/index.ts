import dayjs from 'dayjs'
import { convertTimestampToMilliseconds } from './date-time'

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
  if (!value) return null

  switch (dataType) {
    case 'Date':
      return dayjs(0).add(value, 'day').format('YYYY-MM-DD HH:mm:ss')
    case 'DateTime':
      return dayjs(value).format('YYYY-MM-DD HH:mm:ss')
    default: {
      // Use the universal timestamp conversion utility for all timestamp types
      const ms = convertTimestampToMilliseconds(value, dataType)
      return dayjs(ms).format('YYYY-MM-DD HH:mm:ss')
    }
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
