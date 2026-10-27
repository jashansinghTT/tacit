// The Tacit mark, from web/src/components/layout/Logo.tsx (24-unit box): a finger's joint chain
// bending toward a point, drawn as a lit skeleton.
export const CHAIN = [[6, 18.5], [9.6, 12.6], [14.2, 9.4], [18.2, 8.6]]
export const JOINT_R = [1.7, 1.35, 1.2, 1.8]
export const JOINT_FILL = ['#3cd7ff', '#3cd7ff', '#8be9ff', '#ffffff']

/** Chain joint positions on stage for a mark centred at (cx, cy), k px per unit. */
export function chainAt(cx, cy, k) {
  return CHAIN.map(([x, y]) => [cx + (x - 12) * k, cy + (y - 12) * k])
}

function roundRect(g, x, y, w, h, r) {
  g.beginPath()
  g.moveTo(x + r, y)
  g.arcTo(x + w, y, x + w, y + h, r)
  g.arcTo(x + w, y + h, x, y + h, r)
  g.arcTo(x, y + h, x, y, r)
  g.arcTo(x, y, x + w, y, r)
  g.closePath()
}

/**
 * Draw the mark. pts: the four chain joints on stage (defaults to the mark's own); box 0..1 fades
 * the rounded square in; ring 0..1 grows the tip's halo; glow scales the bloom.
 */
export function drawMark(g, cx, cy, k, { pts = chainAt(cx, cy, k), box = 1, ring = 1, glow = 1, alpha = 1, width = 1 } = {}) {
  g.save()
  if (box > 0) {
    const s = 22.5 * k
    const grow = 0.92 + 0.08 * box
    const w = s * grow
    g.globalAlpha = alpha * box
    roundRect(g, cx - w / 2, cy - w / 2, w, w, 6 * k * grow)
    g.fillStyle = '#0c0e10'
    g.fill()
    g.lineWidth = Math.max(1, k * 0.9)
    g.strokeStyle = 'rgba(255,255,255,0.16)'
    g.stroke()
  }
  // Bloom under the chain.
  g.globalCompositeOperation = 'lighter'
  g.lineCap = 'round'
  g.lineJoin = 'round'
  for (const [w, a] of [[7.5, 0.05], [3.6, 0.12]]) {
    g.globalAlpha = alpha * a * glow
    g.strokeStyle = '#3cd7ff'
    g.lineWidth = 1.6 * k * w * 0.4 * width
    g.beginPath()
    pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)))
    g.stroke()
  }
  g.globalCompositeOperation = 'source-over'
  const grad = g.createLinearGradient(pts[0][0], pts[0][1], pts[3][0], pts[3][1])
  grad.addColorStop(0, '#3cd7ff')
  grad.addColorStop(1, '#b6f1ff')
  g.globalAlpha = alpha
  g.strokeStyle = grad
  g.lineWidth = 1.6 * k * width
  g.beginPath()
  pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)))
  g.stroke()
  pts.forEach(([x, y], i) => {
    g.fillStyle = JOINT_FILL[i]
    g.beginPath()
    g.arc(x, y, JOINT_R[i] * k, 0, Math.PI * 2)
    g.fill()
  })
  if (ring > 0) {
    const [x, y] = pts[3]
    g.globalAlpha = alpha * 0.45 * Math.min(1, ring)
    g.strokeStyle = '#3cd7ff'
    g.lineWidth = 0.8 * k
    g.beginPath()
    g.arc(x, y, 3.4 * k * ring, 0, Math.PI * 2)
    g.stroke()
  }
  g.restore()
}
