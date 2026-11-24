class AsyncQueue<T> {
  private static instance: AsyncQueue<any>
  private queue: [() => Promise<T>, () => void, (error: unknown) => void][]
  private running: boolean

  private constructor() {
    this.queue = []
    this.running = false
  }

  // Singleton instance accessor
  public static getInstance(): AsyncQueue<any> {
    if (!AsyncQueue.instance) {
      AsyncQueue.instance = new AsyncQueue()
    }
    return AsyncQueue.instance
  }

  // Add a task to the queue
  public enqueue(task: () => Promise<T>): Promise<void> {
    let taskComplete: () => void
    let taskFailed: (error: unknown) => void
    const promise = new Promise<void>((resolve, reject) => {
      taskComplete = resolve
      taskFailed = reject
    })
    this.queue.push([task, taskComplete, taskFailed])
    this.runNext()
    return promise
  }

  // Run the next task in the queue
  private async runNext(): Promise<void> {
    if (this.running || this.queue.length === 0) {
      return
    }

    this.running = true

    const [task, taskComplete, taskFailed] = this.queue.shift()
    if (task) {
      try {
        await task()
        taskComplete()
      } catch (error) {
        taskFailed(error)
      }
    }

    this.running = false

    // Run the next task
    this.runNext()
  }
}

// Get the singleton instance
const fieldFillerQueue = AsyncQueue.getInstance()
export default fieldFillerQueue
