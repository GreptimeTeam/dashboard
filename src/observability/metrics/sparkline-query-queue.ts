const SPARKLINE_MAX_CONCURRENCY = 6

type QueueTask<T> = {
  task: () => Promise<T>
  resolve: (value: T) => void
  reject: (reason?: unknown) => void
}

let runningCount = 0
const pending: QueueTask<unknown>[] = []

function pumpQueue(): void {
  if (runningCount >= SPARKLINE_MAX_CONCURRENCY || pending.length === 0) {
    return
  }

  const item = pending.shift()
  if (!item) {
    return
  }

  runningCount += 1
  item
    .task()
    .then(item.resolve)
    .catch(item.reject)
    .finally(() => {
      runningCount -= 1
      pumpQueue()
    })

  pumpQueue()
}

export default function enqueueSparklineQuery<T>(task: () => Promise<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    pending.push({
      task,
      resolve: resolve as (value: unknown) => void,
      reject,
    })
    pumpQueue()
  })
}
