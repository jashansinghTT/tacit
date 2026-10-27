import { create } from 'zustand'

export interface NarrationLine {
  key: string
  audio: string
  text: string
}

export type NarrationStatus = 'idle' | 'playing' | 'paused' | 'ended' | 'blocked'

interface NarrationState {
  line: NarrationLine | null
  status: NarrationStatus
  play: (line: NarrationLine) => void
  pause: () => void
  resume: () => void
  stop: () => void
}

let el: HTMLAudioElement | null = null

/** The one audio element narration plays through; captions read its clock directly. */
export function narrationAudio(): HTMLAudioElement | null {
  if (typeof Audio === 'undefined') return null
  if (!el) {
    el = new Audio()
    el.preload = 'auto'
    el.addEventListener('ended', () => useNarration.setState({ status: 'ended' }))
    el.addEventListener('pause', () => {
      const s = useNarration.getState().status
      if (s === 'playing' && !el!.ended) useNarration.setState({ status: 'paused' })
    })
    el.addEventListener('play', () => useNarration.setState({ status: 'playing' }))
    el.addEventListener('error', () => {
      if (useNarration.getState().line) useNarration.setState({ status: 'ended' })
    })
  }
  return el
}

export const useNarration = create<NarrationState>((set, get) => ({
  line: null,
  status: 'idle',
  play: (line) => {
    const a = narrationAudio()
    if (!a) return
    if (get().line?.audio !== line.audio) {
      a.src = line.audio
    }
    a.currentTime = 0
    set({ line, status: 'playing' })
    a.play().catch((e: Error) => {
      // Autoplay without a gesture is refused; the UI offers a play button instead.
      set({ status: e.name === 'NotAllowedError' ? 'blocked' : 'ended' })
    })
  },
  pause: () => narrationAudio()?.pause(),
  resume: () => {
    const a = narrationAudio()
    if (!a || !get().line) return
    a.play().catch(() => set({ status: 'blocked' }))
  },
  stop: () => {
    const a = narrationAudio()
    if (a) {
      a.pause()
      a.removeAttribute('src')
      a.load()
    }
    set({ line: null, status: 'idle' })
  },
}))
