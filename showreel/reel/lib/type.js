// Huge sparse type: words in masks (for rises), optionally split into letters.
import { R } from '../main.js'

/**
 * A line of words. parts: [{ t: 'know', serif: true, grad: true, letters: false }, ...] or strings.
 * Returns the line element and, per word, its mask, inner span and letter spans.
 */
export function line(parent, parts, { size = 200, cls = 'huge', style = '' } = {}) {
  const el = R.el('div', cls, parent)
  el.style.cssText = `font-size:${size}px;${style}`
  const words = parts.map((p, i) => {
    const w = typeof p === 'string' ? { t: p } : p
    if (i > 0) el.appendChild(document.createTextNode(' '))
    const mask = R.el('span', 'mask', el)
    const inner = R.el('span', (w.serif ? 'serif ' : '') + (w.grad ? 'ion-grad' : ''), mask)
    let letters = []
    if (w.letters) {
      letters = [...w.t].map((ch) => {
        const s = R.el('span', '', inner, ch)
        s.style.display = 'inline-block'
        return s
      })
    } else inner.textContent = w.t
    if (w.serif) inner.style.paddingRight = '0.08em'
    return { mask, inner, letters }
  })
  return { el, words }
}

/** Rise a word out of its mask: p 0 = hidden below, 1 = in place. */
export function rise(word, p, { from = 1.08 } = {}) {
  word.inner.style.transform = `translateY(${(1 - p) * from * 100}%)`
}
