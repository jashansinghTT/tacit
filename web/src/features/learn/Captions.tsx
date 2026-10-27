import { useEffect, useMemo, useRef } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { cn } from '@/lib/cn'
import { narrationAudio, useNarration } from './narration'

/**
 * Captions for the narration. Words light up as the line plays (timed by the audio's progress,
 * since the speech model gives no word timings), so the trainee can read along.
 */
export function Captions({ className }: { className?: string }) {
  const line = useNarration((s) => s.line)
  const status = useNarration((s) => s.status)
  const words = useMemo(() => (line ? line.text.split(/\s+/).filter(Boolean) : []), [line])
  const refs = useRef<(HTMLSpanElement | null)[]>([])
  const visible = Boolean(line) && (status === 'playing' || status === 'paused' || status === 'blocked')

  useEffect(() => {
    if (!visible) return
    let raf = 0
    // Weight each word by its length so long words take longer, as they do when spoken.
    const weights = words.map((w) => w.length + 2)
    const total = weights.reduce((a, b) => a + b, 0) || 1
    const tick = () => {
      raf = requestAnimationFrame(tick)
      const a = narrationAudio()
      const p = a && a.duration ? a.currentTime / a.duration : 0
      let acc = 0
      for (let i = 0; i < words.length; i++) {
        const span = refs.current[i]
        if (span) span.dataset.on = acc / total <= p ? '1' : '0'
        acc += weights[i]
      }
    }
    tick()
    return () => cancelAnimationFrame(raf)
  }, [visible, words])

  return (
    <div className={cn('pointer-events-none absolute inset-x-0 bottom-0 flex justify-center px-6 pb-5', className)} aria-live="polite" data-testid="captions">
      <AnimatePresence>
        {visible && line && (
          <motion.p
            key={line.key}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 4 }}
            transition={{ duration: 0.25 }}
            className="max-w-[min(46rem,92%)] rounded-lg bg-ink-950/80 px-4 py-2.5 text-center text-[15px] leading-relaxed text-pretty shadow-[0_0_0_1px_var(--color-line)] backdrop-blur-md"
          >
            {words.map((w, i) => (
              <span
                key={i}
                ref={(r) => {
                  refs.current[i] = r
                }}
                data-on="0"
                className="text-fg-subtle transition-colors duration-150 data-[on='1']:text-fg"
              >
                {w}{' '}
              </span>
            ))}
          </motion.p>
        )}
      </AnimatePresence>
    </div>
  )
}
