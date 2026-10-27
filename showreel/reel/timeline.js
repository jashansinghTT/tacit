// The cut, in bars of the soundtrack. Times come from the chosen take's beat grid
// (tools/analyze_music.py); `offset` is where in the take the reel starts.
import coldOpen from './sections/coldopen.js'
import hands from './sections/hands.js'
import title from './sections/title.js'
import watch from './sections/watch.js'
import check from './sections/check.js'
import teach from './sections/teach.js'
import act from './sections/do.js'
import earn from './sections/earn.js'
import box from './sections/box.js'
import tagline from './sections/tagline.js'
import endcard from './sections/endcard.js'

export const MUSIC = { take: 'take_11', offset: 0, end: 74.3 } // end: the master's length (stop + tail)

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
    [watch, 10, 13],
    [check, 13, 16],
    [teach, 16, 18],
    [act, 18, 21],
    [earn, 21, 23],
    [box, 23, 25],
    [tagline, 25, 28],
    [endcard, 28, 'end'],
  ]
  for (const [make, b0, b1] of plan) {
    const s = make(T)
    s.start = b0 === 0 ? 0 : T.bar(b0)
    s.end = b1 === 'end' ? MUSIC.end - MUSIC.offset : T.bar(b1)
    T.sections.push(s)
  }
  T.duration = T.sections[T.sections.length - 1].end
  return T
}
