// Browser media: camera frames, microphone with voice-activity cut-off, WAV encoding, playback.
import { useCallback, useEffect, useRef, useState } from 'react'

export function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(String(r.result).split(',')[1] ?? '')
    r.onerror = () => reject(r.error)
    r.readAsDataURL(blob)
  })
}

/** 16-bit PCM mono WAV at `rate` Hz, resampled from `input` at `inRate`. */
export function encodeWav(input: Float32Array, inRate: number, rate = 16000): Blob {
  const ratio = inRate / rate
  const n = Math.floor(input.length / ratio)
  const buf = new ArrayBuffer(44 + n * 2)
  const v = new DataView(buf)
  const w = (o: number, s: string) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)))
  w(0, 'RIFF')
  v.setUint32(4, 36 + n * 2, true)
  w(8, 'WAVE')
  w(12, 'fmt ')
  v.setUint32(16, 16, true)
  v.setUint16(20, 1, true)
  v.setUint16(22, 1, true)
  v.setUint32(24, rate, true)
  v.setUint32(28, rate * 2, true)
  v.setUint16(32, 2, true)
  v.setUint16(34, 16, true)
  w(36, 'data')
  v.setUint32(40, n * 2, true)
  for (let i = 0; i < n; i++) {
    // box-filter downsample
    const a = Math.floor(i * ratio)
    const b = Math.min(input.length, Math.floor((i + 1) * ratio))
    let s = 0
    for (let k = a; k < b; k++) s += input[k]
    const x = Math.max(-1, Math.min(1, s / Math.max(1, b - a)))
    v.setInt16(44 + i * 2, x < 0 ? x * 0x8000 : x * 0x7fff, true)
  }
  return new Blob([buf], { type: 'audio/wav' })
}

// ---------------------------------------------------------------------------------------------
// Camera

export type CamState = 'idle' | 'starting' | 'live' | 'denied' | 'error'

export function useCamera() {
  const [stream, setStream] = useState<MediaStream | null>(null)
  const [state, setState] = useState<CamState>('idle')
  const [error, setError] = useState<string | null>(null)
  const start = useCallback(async () => {
    setState('starting')
    setError(null)
    try {
      const s = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } }, audio: false })
      setStream(s)
      setState('live')
      return s
    } catch (e) {
      const err = e as DOMException
      setState(err.name === 'NotAllowedError' ? 'denied' : 'error')
      setError(err.name === 'NotAllowedError' ? 'Camera permission was denied.' : err.message || 'No camera found.')
      return null
    }
  }, [])
  const stop = useCallback(() => {
    setStream((s) => {
      s?.getTracks().forEach((t) => t.stop())
      return null
    })
    setState('idle')
  }, [])
  useEffect(() => () => stream?.getTracks().forEach((t) => t.stop()), [stream])
  return { stream, state, error, start, stop }
}

/** Grabs JPEG frames (base64) from a video element, at most `maxW` wide. */
export function useFrameGrabber(maxW = 960) {
  const canvas = useRef<HTMLCanvasElement | null>(null)
  return useCallback(
    async (video: HTMLVideoElement, quality = 0.72): Promise<string | null> => {
      if (!video.videoWidth || video.readyState < 2) return null
      const scale = Math.min(1, maxW / video.videoWidth)
      const w = Math.round(video.videoWidth * scale)
      const h = Math.round(video.videoHeight * scale)
      if (!canvas.current) canvas.current = document.createElement('canvas')
      const c = canvas.current
      if (c.width !== w) c.width = w
      if (c.height !== h) c.height = h
      const ctx = c.getContext('2d')
      if (!ctx) return null
      ctx.drawImage(video, 0, 0, w, h)
      const blob = await new Promise<Blob | null>((r) => c.toBlob(r, 'image/jpeg', quality))
      return blob ? blobToBase64(blob) : null
    },
    [maxW],
  )
}

// ---------------------------------------------------------------------------------------------
// Microphone with voice-activity detection

const WORKLET = `
class Tap extends AudioWorkletProcessor {
  process(inputs) {
    const ch = inputs[0] && inputs[0][0]
    if (ch) this.port.postMessage(ch.slice(0))
    return true
  }
}
registerProcessor('tacit-tap', Tap)
`

export type MicState = 'off' | 'starting' | 'listening' | 'recording' | 'denied' | 'error'

export interface MicOptions {
  /** Called with a finished utterance (16 kHz mono WAV). */
  onUtterance?: (wav: Blob, seconds: number) => void
  /** Start recording automatically when speech is heard (hands-free). */
  autoStart?: boolean
  /** Silence that ends an utterance. */
  silenceMs?: number
  /** RMS level that counts as speech. */
  threshold?: number
}

/**
 * Microphone with a live level meter, push-to-talk, and automatic cut-off: once speech has been
 * heard, `silenceMs` of quiet ends the utterance and hands a WAV to `onUtterance`.
 */
export function useMicrophone(opts: MicOptions = {}) {
  const [state, setState] = useState<MicState>('off')
  const [level, setLevel] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const optsRef = useRef(opts)
  optsRef.current = opts
  const ctx = useRef<AudioContext | null>(null)
  const stream = useRef<MediaStream | null>(null)
  const chunks = useRef<Float32Array[]>([])
  const recording = useRef(false)
  const heard = useRef(false)
  const lastLoud = useRef(0)
  const started = useRef(0)
  const stateRef = useRef<MicState>('off')
  const setS = (s: MicState) => {
    stateRef.current = s
    setState(s)
  }

  const finish = useCallback(() => {
    if (!recording.current) return
    recording.current = false
    heard.current = false
    const total = chunks.current.reduce((s, c) => s + c.length, 0)
    const all = new Float32Array(total)
    let o = 0
    for (const c of chunks.current) {
      all.set(c, o)
      o += c.length
    }
    chunks.current = []
    const rate = ctx.current?.sampleRate ?? 48000
    if (stateRef.current === 'recording') setS('listening')
    if (total / rate >= 0.35) optsRef.current.onUtterance?.(encodeWav(all, rate), total / rate)
  }, [])

  const onSamples = useCallback(
    (buf: Float32Array) => {
      let sum = 0
      for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i]
      const rms = Math.sqrt(sum / buf.length)
      setLevel((l) => l * 0.7 + Math.min(1, rms * 6) * 0.3)
      const now = performance.now()
      const th = optsRef.current.threshold ?? 0.02
      const loud = rms > th
      if (loud) lastLoud.current = now
      if (!recording.current && loud && optsRef.current.autoStart) {
        recording.current = true
        heard.current = true
        started.current = now
        chunks.current = []
        setS('recording')
      }
      if (recording.current) {
        chunks.current.push(buf)
        if (loud) heard.current = true
        const silence = optsRef.current.silenceMs ?? 900
        if (heard.current && now - lastLoud.current > silence && now - started.current > 600) finish()
        if (now - started.current > 30000) finish()
      }
    },
    [finish],
  )

  const start = useCallback(async () => {
    if (ctx.current) return true
    setS('starting')
    setError(null)
    try {
      const s = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, channelCount: 1 } })
      stream.current = s
      const ac = new AudioContext()
      ctx.current = ac
      const src = ac.createMediaStreamSource(s)
      try {
        const url = URL.createObjectURL(new Blob([WORKLET], { type: 'application/javascript' }))
        await ac.audioWorklet.addModule(url)
        const node = new AudioWorkletNode(ac, 'tacit-tap')
        node.port.onmessage = (e) => onSamples(e.data as Float32Array)
        src.connect(node)
      } catch {
        const sp = ac.createScriptProcessor(2048, 1, 1)
        sp.onaudioprocess = (e) => onSamples(new Float32Array(e.inputBuffer.getChannelData(0)))
        src.connect(sp)
        sp.connect(ac.destination)
      }
      setS('listening')
      return true
    } catch (e) {
      const err = e as DOMException
      setS(err.name === 'NotAllowedError' ? 'denied' : 'error')
      setError(err.name === 'NotAllowedError' ? 'Microphone permission was denied.' : err.message || 'No microphone found.')
      return false
    }
  }, [onSamples])

  const stop = useCallback(() => {
    finish()
    stream.current?.getTracks().forEach((t) => t.stop())
    stream.current = null
    void ctx.current?.close()
    ctx.current = null
    setLevel(0)
    setS('off')
  }, [finish])

  /** Push-to-talk: begin an utterance now. */
  const begin = useCallback(async () => {
    const ok = await start()
    if (!ok) return
    recording.current = true
    heard.current = false
    started.current = performance.now()
    lastLoud.current = performance.now()
    chunks.current = []
    setS('recording')
  }, [start])

  /** Push-to-talk: end the utterance now. */
  const end = useCallback(() => finish(), [finish])

  useEffect(() => () => stop(), [stop])
  return { state, level, error, start, stop, begin, end }
}

// ---------------------------------------------------------------------------------------------
// Playback with captions

export interface SpokenLine {
  id: string
  text: string
  audio: string | null
  who?: string
}

/** Plays generated speech one line at a time and exposes the caption for the line playing. */
export function useSpeaker() {
  const audio = useRef<HTMLAudioElement | null>(null)
  const [current, setCurrent] = useState<SpokenLine | null>(null)
  const [playing, setPlaying] = useState(false)
  const say = useCallback((line: SpokenLine) => {
    setCurrent(line)
    if (!line.audio) {
      setPlaying(false)
      return Promise.resolve()
    }
    if (!audio.current) audio.current = new Audio()
    const a = audio.current
    a.pause()
    a.src = line.audio
    setPlaying(true)
    return new Promise<void>((resolve) => {
      a.onended = () => {
        setPlaying(false)
        resolve()
      }
      a.onerror = () => {
        setPlaying(false)
        resolve()
      }
      a.play().catch(() => {
        setPlaying(false)
        resolve()
      })
    })
  }, [])
  const stop = useCallback(() => {
    audio.current?.pause()
    setPlaying(false)
  }, [])
  useEffect(() => () => audio.current?.pause(), [])
  return { say, stop, current, playing }
}
