// The cut, in bars of the soundtrack. Times come from the chosen take's beat grid
// (tools/analyze_music.py); `offset` is where in the take the reel starts.
import coldOpen from './sections/coldopen.js'
import hands from './sections/hands.js'
import title from './sections/title.js'

export const MUSIC = { take: 'take_11', offset: 0 }

export async function buildTimeline(R) {
  const a = await R.json(`/data/music/${MUSIC.take}.analysis.json`)
  const bars = a.downbeats.map((t) => t - MUSIC.offset)
  const beats = a.beats.map((t) => t - MUSIC.offset)
  const T = {
    music: a,
    bars,
    beats,
    /** Time of bar k plus `beat` beats (fractional allowed), on the detected grid. */
    bar(k, beat = 0) {
      const t0 = bars[k]
      if (!beat) return t0
      const i = beats.findIndex((b) => b >= t0 - 0.05)
      const j = i + beat
      const lo = Math.floor(j)
      const f = j - lo
      const b0 = beats[lo] ?? beats[beats.length - 1] + (lo - beats.length + 1) * a.ibi_mean
      const b1 = beats[lo + 1] ?? b0 + a.ibi_mean
      return b0 + (b1 - b0) * f
    },
    beat: a.ibi_mean,
    sections: [],
  }
  const plan = [
    [coldOpen, 0, 3],
    [hands, 3, 9],
    [title, 9, 10],
  ]
  for (const [make, b0, b1] of plan) {
    const s = make(T)
    s.start = b0 === 0 ? 0 : T.bar(b0)
    s.end = T.bar(b1)
    T.sections.push(s)
  }
  T.duration = T.sections[T.sections.length - 1].end
  return T
}
