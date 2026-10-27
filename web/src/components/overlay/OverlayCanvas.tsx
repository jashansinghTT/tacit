import { useEffect, useRef } from 'react'
import { cn } from '@/lib/cn'
import { containFit, drawOverlay, type OverlayFrame, type OverlayLayers, ALL_LAYERS } from './draw'

/**
 * A canvas laid over a media element. Each animation frame it asks `getFrame` for the current
 * analysis and draws it, mapping source pixels (srcW × srcH) into the element's box.
 */
export function OverlayCanvas({
  getFrame,
  srcW,
  srcH,
  layers = ALL_LAYERS,
  highlightObject,
  className,
}: {
  getFrame: () => OverlayFrame | null | undefined
  srcW: number
  srcH: number
  layers?: OverlayLayers
  highlightObject?: string | null
  className?: string
}) {
  const ref = useRef<HTMLCanvasElement>(null)
  const props = useRef({ getFrame, srcW, srcH, layers, highlightObject })
  props.current = { getFrame, srcW, srcH, layers, highlightObject }

  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    let raf = 0
    let w = 0
    let h = 0
    const dpr = Math.min(2, window.devicePixelRatio || 1)
    const ro = new ResizeObserver(([e]) => {
      w = e.contentRect.width
      h = e.contentRect.height
      canvas.width = Math.round(w * dpr)
      canvas.height = Math.round(h * dpr)
    })
    ro.observe(canvas)
    const tick = () => {
      const p = props.current
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, w, h)
      if (w && h && p.srcW && p.srcH) drawOverlay(ctx, p.getFrame(), containFit(p.srcW, p.srcH, w, h), p.layers, { highlightObject: p.highlightObject })
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
    }
  }, [])

  return <canvas ref={ref} className={cn('pointer-events-none absolute inset-0 size-full', className)} aria-hidden data-testid="overlay-canvas" />
}
