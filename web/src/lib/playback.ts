import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

export interface Playback {
  /** Current time in seconds, always fresh (read it inside animation frames). */
  timeRef: React.MutableRefObject<number>
  /** Time for UI, updated about 15 times a second. */
  time: number
  playing: boolean
  rate: number
  loop: [number, number] | null
  duration: number
  play: () => void
  pause: () => void
  toggle: () => void
  seek: (t: number) => void
  setRate: (r: number) => void
  setLoop: (l: [number, number] | null) => void
  bindVideo: (el: HTMLVideoElement | null) => void
}

/**
 * One clock for a skill's video, overlays and 3D twin. When a video is bound it is the master
 * clock; otherwise (no video, or it failed to load) an internal clock runs at the same rate.
 */
export function usePlayback(duration: number, autoplay = false): Playback {
  const timeRef = useRef(0)
  const video = useRef<HTMLVideoElement | null>(null)
  const [time, setTime] = useState(0)
  const [playing, setPlaying] = useState(autoplay)
  const [rate, setRateState] = useState(1)
  const [loop, setLoopState] = useState<[number, number] | null>(null)
  const playingRef = useRef(autoplay)
  const rateRef = useRef(1)
  const loopRef = useRef<[number, number] | null>(null)
  const durRef = useRef(duration)
  durRef.current = duration

  useEffect(() => {
    let raf = 0
    let last = performance.now()
    let lastUi = 0
    const tick = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000)
      last = now
      const v = video.current
      const usable = v && v.readyState >= 2 && !v.error
      if (usable) {
        timeRef.current = v.currentTime
      } else if (playingRef.current) {
        timeRef.current += dt * rateRef.current
        if (timeRef.current > durRef.current) timeRef.current = loopRef.current ? loopRef.current[0] : 0
      }
      const lp = loopRef.current
      if (lp && timeRef.current >= lp[1]) {
        timeRef.current = lp[0]
        if (usable) v.currentTime = lp[0]
      }
      if (now - lastUi > 66) {
        lastUi = now
        setTime(timeRef.current)
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [])

  const play = useCallback(() => {
    playingRef.current = true
    setPlaying(true)
    const v = video.current
    if (v && !v.error) void v.play().catch(() => undefined)
  }, [])
  const pause = useCallback(() => {
    playingRef.current = false
    setPlaying(false)
    video.current?.pause()
  }, [])
  const toggle = useCallback(() => (playingRef.current ? pause() : play()), [play, pause])
  const seek = useCallback((t: number) => {
    const c = Math.max(0, Math.min(durRef.current, t))
    timeRef.current = c
    setTime(c)
    const v = video.current
    if (v && !v.error && v.readyState >= 1) v.currentTime = c
  }, [])
  const setRate = useCallback((r: number) => {
    rateRef.current = r
    setRateState(r)
    if (video.current) video.current.playbackRate = r
  }, [])
  const setLoop = useCallback(
    (l: [number, number] | null) => {
      loopRef.current = l
      setLoopState(l)
      if (l && (timeRef.current < l[0] || timeRef.current > l[1])) seek(l[0])
    },
    [seek],
  )
  const bindVideo = useCallback((el: HTMLVideoElement | null) => {
    video.current = el
    if (!el) return
    el.playbackRate = rateRef.current
    el.muted = true
    const onEnd = () => {
      if (loopRef.current) return
      playingRef.current = false
      setPlaying(false)
    }
    el.addEventListener('ended', onEnd)
    if (playingRef.current) void el.play().catch(() => undefined)
  }, [])

  return useMemo(
    () => ({ timeRef, time, playing, rate, loop, duration, play, pause, toggle, seek, setRate, setLoop, bindVideo }),
    [time, playing, rate, loop, duration, play, pause, toggle, seek, setRate, setLoop, bindVideo],
  )
}
