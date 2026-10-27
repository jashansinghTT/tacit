import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

/** Fake camera and microphone inputs for Chromium, generated from the mock sample clip. */
export default function globalSetup() {
  const dir = fileURLToPath(new URL('./.media/', import.meta.url))
  mkdirSync(dir, { recursive: true })
  const video = `${dir}capture.mjpeg`
  const audio = `${dir}answer.wav`
  const sample = fileURLToPath(new URL('../public/mock/samples/sort.mp4', import.meta.url))
  if (!existsSync(video)) {
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', sample, '-vf', 'scale=960:540,fps=15', '-q:v', '6', video])
  }
  if (!existsSync(audio)) {
    // two seconds of tone (speech-like energy for the voice-activity cut-off), then silence
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'lavfi', '-i', 'sine=frequency=220:duration=2,volume=0.6', '-f', 'lavfi', '-i', 'anullsrc=r=48000:cl=mono', '-filter_complex', '[0][1]concat=n=2:v=0:a=1,atrim=0:4', '-ar', '48000', '-ac', '1', audio])
  }
}
