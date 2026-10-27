// Speech UI: a live mic level meter, a push-to-talk button, and a caption line.
import { AnimatePresence, motion } from 'framer-motion'
import { Mic, MicOff, Square, Volume2 } from 'lucide-react'
import { cn } from '@/lib/cn'
import type { MicState } from '@/lib/media'

export function LevelMeter({ level, active, bars = 18, className }: { level: number; active: boolean; bars?: number; className?: string }) {
  return (
    <div className={cn('flex h-6 items-center gap-[3px]', className)} aria-hidden data-testid="mic-level">
      {Array.from({ length: bars }, (_, i) => {
        const center = 1 - Math.abs(i - (bars - 1) / 2) / ((bars - 1) / 2)
        const h = active ? Math.max(0.12, Math.min(1, level * (0.6 + center * 0.9) + 0.05 * Math.sin(i * 1.7))) : 0.12
        return <span key={i} className={cn('w-[3px] rounded-full transition-[height] duration-75', active && level > 0.08 ? 'bg-ion' : 'bg-white/15')} style={{ height: `${h * 100}%` }} />
      })}
    </div>
  )
}

/** Hold or click to talk. While recording, click again (or stay quiet) to finish. */
export function TalkButton({ state, level, onBegin, onEnd, label = 'Answer by voice', disabled, size = 'md' }: { state: MicState; level: number; onBegin: () => void; onEnd: () => void; label?: string; disabled?: boolean; size?: 'sm' | 'md' }) {
  const rec = state === 'recording'
  const denied = state === 'denied' || state === 'error'
  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        disabled={disabled || denied}
        onClick={() => (rec ? onEnd() : onBegin())}
        data-testid="talk-button"
        aria-pressed={rec}
        className={cn(
          'relative inline-flex items-center gap-2 rounded-full font-medium transition-all disabled:opacity-40',
          size === 'sm' ? 'h-8 px-3 text-xs' : 'h-10 px-4 text-[13px]',
          rec ? 'bg-fault text-white shadow-[0_0_0_4px_rgb(255_93_93/0.2),0_0_24px_rgb(255_93_93/0.5)]' : 'bg-ion-soft text-ion shadow-[inset_0_0_0_1px_rgb(60_215_255/0.35)] hover:bg-ion/20',
        )}
      >
        {rec && <span className="absolute inset-0 animate-ping rounded-full bg-fault/30" aria-hidden />}
        {denied ? <MicOff className="size-4" /> : rec ? <Square className="relative size-3.5 fill-current" /> : <Mic className="size-4" />}
        <span className="relative">{denied ? 'Microphone unavailable' : rec ? 'Stop' : label}</span>
      </button>
      <LevelMeter level={level} active={state === 'recording' || state === 'listening'} />
    </div>
  )
}

/** A caption for a generated voice line (every spoken line on screen has one). */
export function Caption({ text, who, speaking, className }: { text: string | null | undefined; who?: string; speaking?: boolean; className?: string }) {
  return (
    <AnimatePresence mode="wait">
      {text && (
        <motion.div
          key={text}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          className={cn('flex items-start gap-2.5 rounded-lg bg-ink-950/85 px-3.5 py-2.5 backdrop-blur', className)}
          role="status"
          aria-live="polite"
          data-testid="caption"
        >
          <Volume2 className={cn('mt-0.5 size-4 shrink-0', speaking ? 'animate-pulse text-ion' : 'text-fg-subtle')} />
          <p className="text-[13px] leading-relaxed text-fg">
            {who && <span className="mr-1.5 font-medium text-ion">{who}:</span>}
            {text}
          </p>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
