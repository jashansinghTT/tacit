type QueueListener = (state: { playing: boolean; index: number | null }) => void

/**
 * Plays the tutor's spoken answer: one clip per sentence, back to back in index order, each
 * starting as soon as the previous one ends. Parts may arrive late or out of order.
 */
export class AudioQueue {
  private parts = new Map<number, string>()
  private next = 0
  private el: HTMLAudioElement | null = null
  private stopped = false
  private listener: QueueListener | null = null
  playing = false

  onChange(fn: QueueListener | null) {
    this.listener = fn
  }

  push(index: number, url: string) {
    if (this.stopped) return
    this.parts.set(index, url)
    if (!this.playing) this.pump()
  }

  private emit(index: number | null) {
    this.listener?.({ playing: this.playing, index })
  }

  private pump() {
    const url = this.parts.get(this.next)
    if (!url || this.stopped) {
      this.playing = false
      this.emit(null)
      return
    }
    const index = this.next
    this.parts.delete(index)
    this.next += 1
    const el = new Audio(url)
    this.el = el
    this.playing = true
    this.emit(index)
    const advance = () => {
      if (this.el === el) this.pump()
    }
    el.onended = advance
    el.onerror = advance
    el.play().catch(advance)
  }

  stop() {
    this.stopped = true
    this.playing = false
    if (this.el) {
      this.el.onended = null
      this.el.onerror = null
      this.el.pause()
    }
    this.el = null
    this.parts.clear()
    this.emit(null)
  }
}
