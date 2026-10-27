// Browser media helpers for the lesson player: WAV encoding for spoken questions, an audio
// queue for the tutor's sentence-by-sentence answer, and JPEG frames for practice.

/** Decode any recorded audio (webm/opus, ogg, wav) and re-encode it as 16 kHz mono 16-bit WAV. */
export async function toWav16k(blob: Blob): Promise<Blob> {
  const ctx = new AudioContext()
  try {
    const decoded = await ctx.decodeAudioData(await blob.arrayBuffer())
    const rate = 16000
    const frames = Math.max(1, Math.ceil(decoded.duration * rate))
    const offline = new OfflineAudioContext(1, frames, rate)
    const src = offline.createBufferSource()
    src.buffer = decoded
    src.connect(offline.destination)
    src.start()
    const mono = (await offline.startRendering()).getChannelData(0)
    return encodeWav(mono, rate)
  } finally {
    void ctx.close()
  }
}

export function encodeWav(samples: Float32Array, rate: number): Blob {
  const buf = new ArrayBuffer(44 + samples.length * 2)
  const v = new DataView(buf)
  const str = (o: number, s: string) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)))
  str(0, 'RIFF')
  v.setUint32(4, 36 + samples.length * 2, true)
  str(8, 'WAVE')
  str(12, 'fmt ')
  v.setUint32(16, 16, true)
  v.setUint16(20, 1, true)
  v.setUint16(22, 1, true)
  v.setUint32(24, rate, true)
  v.setUint32(28, rate * 2, true)
  v.setUint16(32, 2, true)
  v.setUint16(34, 16, true)
  str(36, 'data')
  v.setUint32(40, samples.length * 2, true)
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]))
    v.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true)
  }
  return new Blob([buf], { type: 'audio/wav' })
}

export function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(String(r.result).split(',', 2)[1] ?? '')
    r.onerror = () => reject(r.error)
    r.readAsDataURL(blob)
  })
}

/** Draw the current video frame, scaled to `maxW`, and encode it as a JPEG (base64, no prefix). */
export async function grabJpeg(video: HTMLVideoElement, canvas: HTMLCanvasElement, maxW = 640, quality = 0.72): Promise<string | null> {
  const w = video.videoWidth
  const h = video.videoHeight
  if (!w || !h) return null
  const scale = Math.min(1, maxW / w)
  canvas.width = Math.round(w * scale)
  canvas.height = Math.round(h * scale)
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
  const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/jpeg', quality))
  return blob ? blobToBase64(blob) : null
}

type QueueListener = (state: { playing: boolean; index: number | null }) => void

/**
 * Plays audio clips back to back in index order as they arrive. Parts can arrive out of order
 * or while an earlier one is still playing; each starts as soon as the previous one ends.
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

/** Live input level (0..1) from a microphone stream, sampled on animation frames. */
export function micLevel(stream: MediaStream, onLevel: (v: number) => void): () => void {
  const ctx = new AudioContext()
  const src = ctx.createMediaStreamSource(stream)
  const an = ctx.createAnalyser()
  an.fftSize = 512
  src.connect(an)
  const data = new Uint8Array(an.fftSize)
  let raf = 0
  const tick = () => {
    an.getByteTimeDomainData(data)
    let sum = 0
    for (const d of data) sum += ((d - 128) / 128) ** 2
    onLevel(Math.min(1, Math.sqrt(sum / data.length) * 4))
    raf = requestAnimationFrame(tick)
  }
  tick()
  return () => {
    cancelAnimationFrame(raf)
    src.disconnect()
    void ctx.close()
  }
}
