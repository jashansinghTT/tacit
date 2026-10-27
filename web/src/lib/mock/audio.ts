// Mock speech: a near-silent WAV of the right length, served from a blob URL. Captions carry
// the words; the real backend returns S2 Pro audio instead.

function wavBytes(seconds: number, rate = 16000): Uint8Array {
  const n = Math.max(1, Math.round(seconds * rate))
  const buf = new ArrayBuffer(44 + n * 2)
  const v = new DataView(buf)
  const str = (o: number, s: string) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)))
  str(0, 'RIFF')
  v.setUint32(4, 36 + n * 2, true)
  str(8, 'WAVE')
  str(12, 'fmt ')
  v.setUint32(16, 16, true)
  v.setUint16(20, 1, true)
  v.setUint16(22, 1, true)
  v.setUint32(24, rate, true)
  v.setUint32(28, rate * 2, true)
  v.setUint16(32, 2, true)
  v.setUint16(34, 16, true)
  str(36, 'data')
  v.setUint32(40, n * 2, true)
  for (let i = 0; i < n; i++) v.setInt16(44 + i * 2, Math.round(Math.sin(i * 0.05) * 8), true)
  return new Uint8Array(buf)
}

const cache = new Map<number, string>()

export function silentWav(seconds: number): string {
  const key = Math.round(seconds * 10) / 10
  let url = cache.get(key)
  if (!url) {
    url = URL.createObjectURL(new Blob([wavBytes(key) as BlobPart], { type: 'audio/wav' }))
    cache.set(key, url)
  }
  return url
}
