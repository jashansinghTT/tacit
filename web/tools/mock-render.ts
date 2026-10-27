// Dev-only page used by render-mock-media.mjs to draw frames of the procedural mock scene.
import { drawFrame } from '../src/lib/mock/scene'

const canvas = document.getElementById('c') as HTMLCanvasElement
const ctx = canvas.getContext('2d')!

declare global {
  interface Window {
    renderFrame: (t: number, fake: boolean, quality?: number) => string
    ready: boolean
  }
}

window.renderFrame = (t, fake, quality = 0.86) => {
  ctx.clearRect(0, 0, canvas.width, canvas.height)
  drawFrame(ctx, t, { fake, noise: true })
  return canvas.toDataURL('image/jpeg', quality)
}
window.ready = true
