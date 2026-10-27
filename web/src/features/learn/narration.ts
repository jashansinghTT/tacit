import { create } from 'zustand'
import { api } from '@/lib/api'

export interface NarrationLine {
  key: string
  /** The lesson's own recording of the line; when missing, the line is voiced on demand. */
  audio: string | null
  text: string
  lang?: string
}

export interface MusicBed {
  audio: string
  credit: string
}

export type NarrationStatus = 'idle' | 'loading' | 'playing' | 'paused' | 'ended' | 'blocked'

interface NarrationState {
  line: NarrationLine | null
  status: NarrationStatus
  /** The intro music playing under the voice, with the credit its licence asks for. */
  music: MusicBed | null
  play: (line: NarrationLine, music?: MusicBed | null) => void
  pause: () => void
  resume: () => void
  stop: () => void
}

const MUSIC_VOLUME = 0.16

let el: HTMLAudioElement | null = null
let bed: HTMLAudioElement | null = null
let fade: ReturnType<typeof setInterval> | null = null
let token = 0

/** The one audio element narration plays through; captions read its clock directly. */
export function narrationAudio(): HTMLAudioElement | null {
  if (typeof Audio === 'undefined') return null
  if (!el) {
    el = new Audio()
    el.preload = 'auto'
    el.addEventListener('ended', () => {
      useNarration.setState({ status: 'ended' })
      fadeMusic(0, 1200)
    })
    el.addEventListener('pause', () => {
      const s = useNarration.getState().status
      if (s === 'playing' && !el!.ended) useNarration.setState({ status: 'paused' })
    })
    el.addEventListener('play', () => useNarration.setState({ status: 'playing' }))
    el.addEventListener('error', () => {
      const s = useNarration.getState()
      if (s.line && s.status !== 'loading') useNarration.setState({ status: 'ended' })
    })
  }
  return el
}

function fadeMusic(to: number, ms: number) {
  if (!bed) return
  if (fade) clearInterval(fade)
  const a = bed
  const from = a.volume
  const t0 = performance.now()
  fade = setInterval(() => {
    const k = Math.min(1, (performance.now() - t0) / ms)
    a.volume = from + (to - from) * k
    if (k >= 1) {
      if (fade) clearInterval(fade)
      fade = null
      if (to === 0) {
        a.pause()
        if (bed === a) bed = null
        useNarration.setState({ music: null })
      }
    }
  }, 50)
}

function startMusic(m: MusicBed) {
  if (bed) bed.pause()
  bed = new Audio(m.audio)
  bed.volume = 0
  const a = bed
  a.onended = () => {
    if (bed === a) {
      bed = null
      useNarration.setState({ music: null })
    }
  }
  a.play()
    .then(() => {
      useNarration.setState({ music: m })
      fadeMusic(MUSIC_VOLUME, 600)
    })
    .catch(() => undefined)
}

export const useNarration = create<NarrationState>((set, get) => ({
  line: null,
  status: 'idle',
  music: null,
  play: (line, music) => {
    const a = narrationAudio()
    if (!a) return
    const mine = ++token
    if (music) startMusic(music)
    else if (bed) fadeMusic(0, 400)
    const go = (src: string) => {
      if (mine !== token) return
      if (a.getAttribute('src') !== src) a.src = src
      a.currentTime = 0
      set({ status: 'playing' })
      a.play().catch((e: Error) => {
        // Autoplay without a gesture is refused; the UI offers a play button instead.
        if (mine === token) set({ status: e.name === 'NotAllowedError' ? 'blocked' : 'ended' })
      })
    }
    a.pause()
    if (line.audio) {
      set({ line, status: 'playing' })
      go(line.audio)
      return
    }
    // Not voiced yet (a new translation, or narration still being made): ask for it now.
    set({ line, status: 'loading' })
    api
      .tts(line.text, line.lang ?? 'en')
      .then((r) => {
        if (mine !== token) return
        set({ line: { ...line, audio: r.audio } })
        go(r.audio)
      })
      .catch(() => {
        if (mine === token) set({ status: 'ended' })
      })
  },
  pause: () => narrationAudio()?.pause(),
  resume: () => {
    const a = narrationAudio()
    if (!a || !get().line?.audio) return
    a.play().catch(() => set({ status: 'blocked' }))
  },
  stop: () => {
    token++
    const a = narrationAudio()
    if (a) {
      a.pause()
      a.removeAttribute('src')
      a.load()
    }
    if (bed) fadeMusic(0, 300)
    set({ line: null, status: 'idle' })
  },
}))
