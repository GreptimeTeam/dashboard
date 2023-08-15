import numeral from 'numeral'

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

export function bigNumberFormatter(num: number, fixed = FIXED, places = PLACES, tiny = false): string {
  if (!num) return tiny ? '0' : '0 '
  if (num < 1000) return tiny ? num.toFixed(fixed) : `${num} `

  if (typeof places === 'string') {
    for (let i = 0; i < units.length; i += 1) {
      if (places === units[i]) {
        places = i * 3
        break
      }
    }
  }

  const pow = Math.min(Math.floor(Math.log(Math.abs(num)) / Math.log(10)), places)

  let s = `${numeral(num / 10 ** (Math.floor(pow / 3) * 3)).format(`0,0[.]${'0'.repeat(fixed)}`)}`
  if (!tiny) {
    s += ` ${units[Math.floor(pow / 3)]}`
  }
  return s
}

export default null
