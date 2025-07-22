import dayjs from 'dayjs'

export const calculateRange = (timeLength: number, timeRange: string[], now?: dayjs.Dayjs) => {
  if (!now) {
    now = dayjs()
  }
  if (!timeLength) {
    return timeRange
  }
  const end = now.unix().toString()
  const start = now.subtract(timeLength, 'minute').unix().toString()
  return [start, end]
}

const secondsFormat = (s: number) => {
  // TODO
  return s
}

export const calculateStep = (range: number[], maxDataPoints: number, minStep?: number) => {
  if (!minStep) {
    minStep = 15 // default to be 15 seconds
  }
  let step = (range[1] - range[0]) / maxDataPoints

  step = secondsFormat(Math.floor(step))
  if (minStep > step) {
    return `${minStep}`
  }

  return `${step}`
}

export default null
