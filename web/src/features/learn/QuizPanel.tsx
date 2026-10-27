import { useState } from 'react'
import { motion } from 'framer-motion'
import { useQueryClient } from '@tanstack/react-query'
import { Award, Check, Download, ExternalLink, RotateCcw, X } from 'lucide-react'
import { cn } from '@/lib/cn'
import { ApiError } from '@/lib/api'
import { learnApi } from '@/lib/api/learn'
import { useApp } from '@/lib/store'
import { Badge, Button, ScoreRing, toast } from '@/components/ui'
import { useLessonCtx } from './context'
import { useLesson } from './store'

interface Result {
  score: number
  passed: boolean
  certificate: string | null
}

/** Renders the SVG certificate onto a canvas and saves it as a PNG. */
async function downloadPng(url: string, name: string) {
  const img = new Image()
  img.src = url
  await img.decode()
  const c = document.createElement('canvas')
  c.width = 2400
  c.height = 1600
  c.getContext('2d')?.drawImage(img, 0, 0, c.width, c.height)
  const blob = await new Promise<Blob | null>((r) => c.toBlob(r, 'image/png'))
  if (!blob) return
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `${name}.png`
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 2000)
}

function Certificate({ url, title }: { url: string; title: string }) {
  const slug = `tacit-certificate-${title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`
  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }} className="mt-5" data-testid="certificate">
      <div className="relative overflow-hidden rounded-xl p-px [background:linear-gradient(135deg,rgb(60_215_255/0.6),rgb(167_139_250/0.25)_40%,rgb(255_255_255/0.06)_70%,rgb(60_215_255/0.4))]">
        <img src={url} alt={`Certificate for ${title}`} className="block w-full rounded-[11px] bg-ink-950" data-testid="certificate-image" />
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <a
          href={url}
          download={`${slug}.svg`}
          className="inline-flex h-9 items-center gap-2 rounded-md bg-ion px-3.5 text-[13px] font-medium text-ion-ink shadow-[0_0_0_1px_rgb(60_215_255/0.6),0_8px_24px_-8px_rgb(60_215_255/0.6)] hover:bg-[#6ee2ff]"
          data-testid="certificate-download"
        >
          <Download className="size-4" /> Download certificate
        </a>
        <Button size="sm" variant="secondary" onClick={() => void downloadPng(url, slug).catch(() => toast.error('Could not render the PNG'))}>
          Save as PNG
        </Button>
        <a href={url} target="_blank" rel="noreferrer" className="inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-[13px] text-fg-muted hover:bg-white/5 hover:text-fg">
          <ExternalLink className="size-3.5" /> Open
        </a>
      </div>
    </motion.div>
  )
}

export function QuizPanel({ onPassed }: { onPassed?: () => void }) {
  const { lesson } = useLessonCtx()
  const lang = useApp((s) => s.lang)
  const goStep = useLesson((s) => s.goStep)
  const qc = useQueryClient()
  const quiz = lesson.quiz
  const [answers, setAnswers] = useState<(number | null)[]>(() => quiz.map(() => null))
  const [result, setResult] = useState<Result | null>(null)
  const [busy, setBusy] = useState(false)
  const answered = answers.filter((a) => a !== null).length
  const ready = answered === quiz.length

  const submit = async () => {
    setBusy(true)
    const L = useLesson.getState()
    const picks = answers.map((a) => a ?? -1)
    try {
      let sid = await L.ensureSession(lang)
      let r: Result
      try {
        r = await learnApi.complete(sid, picks)
      } catch (e) {
        // The backend forgets sessions when it restarts; open a fresh one and try once more.
        if (!(e instanceof ApiError) || e.status !== 404) throw e
        L.dropSession()
        sid = await L.ensureSession(lang)
        r = await learnApi.complete(sid, picks)
      }
      setResult(r)
      void qc.invalidateQueries({ queryKey: ['learn'] })
      if (r.passed) onPassed?.()
    } catch (e) {
      toast.error('The quiz was not saved', (e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const retry = () => {
    setAnswers(quiz.map(() => null))
    setResult(null)
  }

  return (
    <section className="panel p-5 lg:p-6" data-testid="quiz" aria-labelledby="quiz-title">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="eyebrow">Last step</div>
          <h2 id="quiz-title" className="mt-1.5 text-[22px] font-medium tracking-[-0.02em] text-fg">
            Check what you learned
          </h2>
          <p className="mt-1 max-w-xl text-[13px] text-fg-muted">
            {quiz.length ? `${quiz.length} questions from ${lesson.expert.name}'s lesson. Two out of three right earns the certificate.` : 'This lesson has no quiz. Finish it to get the certificate.'}
          </p>
        </div>
        {!result && quiz.length > 0 && (
          <span className="telemetry rounded-full bg-white/[0.04] px-2.5 py-1 text-xs text-fg-muted shadow-[inset_0_0_0_1px_var(--color-line)]">
            {answered}/{quiz.length} answered
          </span>
        )}
      </div>

      <ol className="mt-5 space-y-4">
        {quiz.map((q, qi) => {
          const pick = answers[qi]
          return (
            <li key={qi} className="rounded-lg bg-white/[0.02] p-4 shadow-[inset_0_0_0_1px_var(--color-line)]" data-testid={`quiz-q-${qi}`}>
              <fieldset disabled={Boolean(result) || busy}>
                <legend className="flex gap-2.5 text-[15px] leading-snug font-medium text-fg">
                  <span className="telemetry text-ion">{String(qi + 1).padStart(2, '0')}</span>
                  {q.q}
                </legend>
                <div className="mt-3 grid gap-1.5">
                  {q.choices.map((c, ci) => {
                    const chosen = pick === ci
                    const right = result && ci === q.answer
                    const wrong = result && chosen && ci !== q.answer
                    return (
                      <label
                        key={ci}
                        className={cn(
                          'flex cursor-pointer items-center gap-3 rounded-md px-3 py-2.5 text-[13.5px] transition-colors',
                          right ? 'bg-ok/[0.1] text-fg shadow-[inset_0_0_0_1px_rgb(61_220_151/0.45)]' : wrong ? 'bg-fault/[0.08] text-fg shadow-[inset_0_0_0_1px_rgb(255_93_93/0.4)]' : chosen ? 'bg-ion/[0.08] text-fg shadow-[inset_0_0_0_1px_rgb(60_215_255/0.45)]' : 'text-fg-muted shadow-[inset_0_0_0_1px_var(--color-line)] hover:bg-white/[0.03] hover:text-fg',
                          result && 'cursor-default',
                        )}
                        data-testid={`quiz-q-${qi}-c-${ci}`}
                      >
                        <input type="radio" name={`q${qi}`} className="peer sr-only" checked={chosen} onChange={() => setAnswers((a) => a.map((v, i) => (i === qi ? ci : v)))} />
                        <span
                          className={cn(
                            'grid size-[18px] shrink-0 place-items-center rounded-full transition-colors peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-ion',
                            right ? 'bg-ok text-ink-950' : wrong ? 'bg-fault text-white' : chosen ? 'bg-ion text-ion-ink' : 'shadow-[inset_0_0_0_1.5px_var(--color-line-bright)]',
                          )}
                          aria-hidden
                        >
                          {right ? <Check className="size-3" strokeWidth={3} /> : wrong ? <X className="size-3" strokeWidth={3} /> : chosen ? <span className="size-1.5 rounded-full bg-ion-ink" /> : null}
                        </span>
                        {c}
                      </label>
                    )
                  })}
                </div>
                {result && q.explain && (
                  <p className="mt-3 border-l-2 border-line-strong pl-3 text-[13px] leading-relaxed text-fg-subtle">{q.explain}</p>
                )}
              </fieldset>
            </li>
          )
        })}
      </ol>

      {!result ? (
        <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
          <Button variant="ghost" size="sm" onClick={() => goStep(lesson.steps.length)}>
            Back to the steps
          </Button>
          <Button variant="primary" size="lg" icon={<Award className="size-4" />} disabled={!ready} loading={busy} onClick={submit} data-testid="quiz-submit">
            {quiz.length ? 'Submit answers' : 'Finish the lesson'}
          </Button>
        </div>
      ) : (
        <div className="mt-6 border-t border-line pt-5" data-testid="quiz-result" data-passed={result.passed}>
          <div className="flex flex-wrap items-center gap-5">
            <ScoreRing value={result.score} size={96} stroke={7} sub="quiz" label="Quiz score" />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-medium text-fg">{result.passed ? 'Passed. Well done.' : 'Not quite yet'}</h3>
                <Badge tone={result.passed ? 'ok' : 'warn'}>{result.passed ? 'Certified' : 'Below 66%'}</Badge>
              </div>
              <p className="mt-1 text-[13px] text-fg-muted">
                {result.passed
                  ? 'Your certificate is ready. Your manager sees it on the Team page.'
                  : 'Look at the explanations, rewatch the steps they point to, and try again.'}
              </p>
            </div>
            {!result.passed && (
              <Button variant="secondary" icon={<RotateCcw className="size-4" />} onClick={retry} data-testid="quiz-retry">
                Try again
              </Button>
            )}
          </div>
          {result.passed && result.certificate && <Certificate url={result.certificate} title={lesson.title} />}
        </div>
      )}
    </section>
  )
}
