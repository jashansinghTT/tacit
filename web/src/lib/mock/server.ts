// The in-app fake backend for mock mode: a router over the paths in docs/API.md.
import type { CreateListing, LicenseType, Listing, Skill } from '../api/types'
import { listingDetail, quizSort, samples, seedBox, seedProgress, summarize, users } from './data'
import { db, evalTrials, getJob, rid, startJob } from './state'
import { pointCloud, SCENE_DURATION, trackAt, twinAt } from './scene'
import { silentWav } from './audio'

type Handler = (ctx: {
  m: RegExpMatchArray
  url: URL
  body: unknown
  form: FormData | null
  user: string
}) => unknown | Promise<unknown>

class HttpError extends Error {
  status: number
  code: string
  constructor(status: number, code: string, message: string) {
    super(message)
    this.status = status
    this.code = code
  }
}

const notFound = (what: string) => new HttpError(404, 'not_found', `${what} not found`)

function skillOr404(id: string): Skill {
  const s = db.skills.get(id)
  if (!s) throw notFound(`skill ${id}`)
  return s
}

const tracksCache = new Map<string, ReturnType<typeof buildTracks>>()
function buildTracks(duration: number) {
  const frames = []
  for (let t = 0; t <= duration; t += 0.1) frames.push(trackAt(t % SCENE_DURATION))
  return { fps: 10, width: 1280, height: 720, frames }
}

// The real twin and clouds use a frame where the camera looks down -z; the mock scene's camera
// looks down +z, so turn the mock world half a turn about y.
const flip = (p: [number, number, number]): [number, number, number] => [-p[0], p[1], -p[2]]

function buildTwin(duration: number) {
  const frames = []
  for (let t = 0; t <= duration; t += 0.1) {
    const f = twinAt(t % SCENE_DURATION)
    frames.push({
      ...f,
      body: f.body?.map(flip) ?? null,
      hands: { left: f.hands.left?.map(flip) ?? null, right: f.hands.right?.map(flip) ?? null },
      gaze: f.gaze ? { origin: flip(f.gaze.origin), target: flip(f.gaze.target) } : null,
      objects: f.objects.map((o) => ({ ...o, pos: flip(o.pos) })),
    })
  }
  return { fps: 10, frames, bounds: { min: [-0.66, 0, -0.62], max: [0.66, 0.8, 0.4] }, up: [0, 1, 0], camera: { position: [0, 0.8, 1.3], f: 808, cx: 640, cy: 360, person_depth_m: 1.75 } }
}

function flippedCloud(fake: boolean) {
  const pts = pointCloud(24000, fake)
  for (let i = 0; i < pts.length; i += 6) {
    pts[i] = -pts[i]
    pts[i + 2] = -pts[i + 2]
  }
  return pts
}

function newSkillFromSample(sampleId: string, kind: Skill['source']['kind']): Skill {
  const base = db.skills.get('sk_sort')!
  const fake = sampleId === 'smp_fake'
  const id = rid('sk')
  const s: Skill = structuredClone(base)
  s.id = id
  s.title = fake ? 'Kitting clip (uploaded)' : kind === 'live' ? 'Live capture' : 'Kit an M6 bracket set (sample)'
  s.status = 'draft'
  s.created_at = new Date().toISOString()
  s.listing_id = null
  s.source = { ...s.source, kind }
  s.verification = { ...s.verification, status: 'pending', score: null, checked_at: null, pointcloud: `/api/skills/${id}/pointcloud` }
  s.robot = { ...s.robot, policy: { status: 'untrained', success_rate: null, trials: null, trained_at: null }, gr00t: { last_run: null } }
  if (kind !== 'live') s.steps = s.steps.map((st) => ({ ...st, why_source: 'inferred' }))
  s.qa = kind === 'live' ? s.qa : s.qa.map((q) => ({ ...q, answer: null }))
  db.skills.set(id, s)
  return s
}

function finishProcessing(id: string) {
  const s = db.skills.get(id)
  if (!s) return
  s.status = 'ready'
  s.job_id = null
  const fake = s.title.includes('uploaded')
  s.verification = {
    ...s.verification,
    status: fake ? 'suspect' : 'verified',
    score: fake ? 0.29 : 0.93,
    details: fake ? { views: 4, reproj_rel: 0.121, depth_stability: 0.93, camera_drift: 0.18 } : { views: 4, reproj_rel: 0.015, depth_stability: 0.994, camera_drift: 0.0012 },
    checked_at: new Date().toISOString(),
  }
  if (s.title === 'Live capture') s.title = 'Kit an M6 bracket set (live)'
}

// Kick off the seeded "processing" skill so the pipeline view has something live.
const flange = db.skills.get('sk_flange')
if (flange) flange.job_id = startJob('process', 'sk_flange', () => finishProcessing('sk_flange'))

const TUTOR_ANSWERS: [RegExp, string, string[]][] = [
  [/variant|which bracket|card/i, 'Read the last two letters of the kit number on the work order. Maria checks it first because the B4 and B6 brackets look the same from the top; the card is the only place that says which one goes in.', ['st1', 'qa:q1']],
  [/rock|press|slot a/i, 'Press the centre of the bracket once after you seat it in slot A. If it rocks, it is the wrong variant: take it out and check the card. In Maria\'s words, "better I find it than the line."', ['st3', 'qa:q3']],
  [/bolt|two|count/i, 'Pick two M6 bolts and roll them between your fingers to count by feel. If you feel three, drop one back before you lift, so you never need to look at the bin.', ['st4']],
]

function tutorAnswer(q: string) {
  for (const [re, text, sources] of TUTOR_ANSWERS) if (re.test(q)) return { text, sources }
  return {
    text: 'Start with the work order, then bracket into slot A with your left hand, two bolts into slot B with your right, and a last look before you push the tray out. Ask me about any step and I will answer from Maria\'s own explanations.',
    sources: ['st1', 'st6'],
  }
}

function sse(events: { event: string; data: unknown }[], gapMs = 45): Response {
  const enc = new TextEncoder()
  const stream = new ReadableStream<Uint8Array>({
    async start(ctrl) {
      for (const e of events) {
        await new Promise((r) => setTimeout(r, gapMs))
        ctrl.enqueue(enc.encode(`event: ${e.event}\ndata: ${JSON.stringify(e.data)}\n\n`))
      }
      ctrl.close()
    },
  })
  return new Response(stream, { status: 200, headers: { 'Content-Type': 'text/event-stream' } })
}

const served = (model: string, chip: number | null, ms: number) => [{ model, chip, backend: 'mock' as const, ms }]

const routes: [string, RegExp, Handler][] = [
  ['GET', /^\/api\/health$/, () => ({ ok: true, version: '0.1.0-mock' })],
  ['GET', /^\/api\/box$/, () => {
    const box = seedBox()
    for (const c of box.chips) for (const m of c.models) {
      m.p50_ms = Math.round((m.p50_ms ?? 0) * (0.94 + Math.random() * 0.12) * 10) / 10
      m.calls += Math.floor((performance.now() / 1000) * (m.p50_ms! < 20 ? 10 : 0.2))
    }
    return box
  }],
  ['GET', /^\/api\/users$/, () => users],
  ['GET', /^\/api\/samples$/, () => samples],
  ['GET', /^\/api\/samples\/([\w-]+)\/verify$/, ({ m }) => {
    const smp = samples.find((x) => x.id === m[1])
    if (!smp) throw notFound(`sample ${m[1]}`)
    const fake = smp.kind === 'ai-generated'
    return {
      sample_id: smp.id, kind: smp.kind, status: fake ? 'suspect' : 'verified', score: fake ? 0.235 : 0.904, method: 'VGGT multi-view consistency',
      details: fake ? { views: 4, reproj_rel: 0.132, depth_stability: 0.95, camera_drift: 0.206, static_pixels: 152292 } : { views: 4, reproj_rel: 0.013, depth_stability: 0.991, camera_drift: 0.0008, static_pixels: 91490 },
      times: [0.4, 1.8, 3.2, 4.7], pointcloud: `/media/samples/${smp.id}.pointcloud.bin`, points: 24000, served_by: served('VGGT-1B', 0, 3610),
    }
  }],
  ['GET', /^\/media\/samples\/([\w-]+)\.pointcloud\.bin$/, ({ m }) => {
    const pts = flippedCloud(m[1] === 'smp_fake')
    return new Response(pts.buffer as ArrayBuffer, { headers: { 'Content-Type': 'application/octet-stream', 'X-Points': String(pts.length / 6) } })
  }],

  ['GET', /^\/api\/skills$/, ({ url }) => {
    const status = url.searchParams.get('status')
    const expert = url.searchParams.get('expert_id')
    return [...db.skills.values()]
      .filter((s) => (!status || s.status === status) && (!expert || s.expert.id === expert))
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .map(summarize)
  }],
  ['POST', /^\/api\/skills$/, ({ body, form }) => {
    if (form) {
      const s = newSkillFromSample('smp_fake', 'upload')
      const title = form.get('title')
      if (typeof title === 'string' && title) s.title = title
      return { skill_id: s.id, status: s.status }
    }
    const b = body as { source: string; sample_id?: string }
    if (b.source === 'sample') {
      if (!samples.find((x) => x.id === b.sample_id)) throw notFound(`sample ${b.sample_id}`)
      const s = newSkillFromSample(b.sample_id!, 'sample')
      if (b.sample_id === 'smp_fake') s.title = 'Kitting clip (uploaded)'
      return { skill_id: s.id, status: s.status }
    }
    if (b.source === 'live') {
      const s = newSkillFromSample('smp_sort', 'live')
      return { skill_id: s.id, status: s.status }
    }
    throw new HttpError(400, 'bad_request', 'source must be sample, live or a file')
  }],
  ['GET', /^\/api\/skills\/([\w-]+)$/, ({ m }) => skillOr404(m[1])],
  ['PATCH', /^\/api\/skills\/([\w-]+)$/, ({ m, body }) => {
    const s = skillOr404(m[1])
    const b = body as Partial<Skill>
    if (b.title) s.title = b.title
    if (b.summary) s.summary = b.summary
    if (b.steps) s.steps = s.steps.map((st) => ({ ...st, ...(b.steps!.find((x) => x.id === st.id) ?? {}) }))
    if (b.qa) {
      s.qa = s.qa.map((q) => {
        const upd = b.qa!.find((x) => (x.id && x.id === q.id) || (x.step_id === q.step_id && x.question === q.question))
        return upd ? { ...q, ...upd } : q
      })
      for (const q of s.qa) {
        const step = s.steps.find((st) => st.id === q.step_id)
        if (step && q.answer && step.why_source === 'inferred') {
          step.why = q.answer
          step.why_source = 'expert'
        }
      }
    }
    return s
  }],
  ['POST', /^\/api\/skills\/([\w-]+)\/answer$/, ({ m, form }) => {
    const s = skillOr404(m[1])
    const typed = form?.get('text')
    const text = typeof typed === 'string' && typed ? typed : 'I roll them between my fingers. Two feels different from three.'
    const idx = Number(form?.get('step_index') ?? NaN)
    const question = form?.get('question')
    const q = s.qa.find((x) => (typeof question === 'string' && x.question === question) || s.steps.find((st) => st.index === idx)?.id === x.step_id)
    if (q) q.answer = text
    const step = s.steps.find((st) => st.index === idx || st.id === q?.step_id)
    if (step) {
      step.why = text
      step.why_source = 'expert'
    }
    return { text, skill: s }
  }],
  ['DELETE', /^\/api\/skills\/([\w-]+)$/, ({ m }) => {
    skillOr404(m[1])
    db.skills.delete(m[1])
    return { ok: true }
  }],
  ['GET', /^\/api\/skills\/([\w-]+)\/tracks$/, ({ m }) => {
    const s = skillOr404(m[1])
    const key = `${s.source.duration}`
    if (!tracksCache.has(key)) tracksCache.set(key, buildTracks(s.source.duration))
    return tracksCache.get(key)
  }],
  ['GET', /^\/api\/skills\/([\w-]+)\/twin$/, ({ m }) => buildTwin(skillOr404(m[1]).source.duration)],
  ['GET', /^\/api\/skills\/([\w-]+)\/pointcloud$/, ({ m }) => {
    const s = skillOr404(m[1])
    const pts = flippedCloud(s.verification.status === 'suspect')
    return new Response(pts.buffer as ArrayBuffer, { headers: { 'Content-Type': 'application/octet-stream', 'X-Points': String(pts.length / 6) } })
  }],
  ['POST', /^\/api\/skills\/([\w-]+)\/process$/, ({ m }) => {
    const s = skillOr404(m[1])
    s.status = 'processing'
    const job_id = startJob('process', s.id, () => finishProcessing(s.id))
    s.job_id = job_id
    return { job_id }
  }],
  ['POST', /^\/api\/skills\/([\w-]+)\/verify$/, ({ m }) => {
    const s = skillOr404(m[1])
    return { job_id: startJob('verify', s.id) }
  }],

  ['GET', /^\/api\/jobs\/([\w-]+)$/, ({ m }) => {
    const j = getJob(m[1])
    if (!j) throw notFound(`job ${m[1]}`)
    return j
  }],

  ['POST', /^\/api\/speech\/tts$/, ({ body }) => {
    const text = (body as { text: string }).text ?? ''
    const duration = Math.max(1.2, text.length / 15)
    return { audio: silentWav(duration), duration, served_by: served('S2 Pro', 1, 92) }
  }],
  ['POST', /^\/api\/speech\/stt$/, () => ({ text: 'Because the blue ones are pre-drilled, so they line up with the jig.', served_by: served('Whisper large-v3', 1, 176) })],

  ['GET', /^\/api\/learn\/lessons$/, ({ user }) => {
    const prog = seedProgress().filter((p) => p.trainee.id === user)
    return [...db.skills.values()]
      .filter((s) => s.status === 'ready' && s.verification.status === 'verified')
      .map((s) => {
        const p = prog.find((x) => x.skill_id === s.id)
        return {
          skill_id: s.id, title: s.title, steps_count: s.steps.length, duration: s.source.duration,
          expert: { id: s.expert.id, name: s.expert.name }, thumb: summarize(s).thumb,
          progress: p ? p.steps_done / p.steps_total : 0,
        }
      })
  }],
  ['GET', /^\/api\/learn\/lessons\/([\w-]+)$/, ({ m }) => {
    const s = skillOr404(m[1])
    return {
      skill_id: s.id, title: s.title,
      steps: s.steps.map((st) => ({
        index: st.index, title: st.title, instruction: st.instruction, why: st.why, keyframe: st.keyframe,
        t_start: st.t_start, t_end: st.t_end, narration_audio: silentWav(Math.max(2, st.instruction.length / 15)),
      })),
      quiz: s.quiz.length ? s.quiz : quizSort,
      intro_audio: silentWav(3),
    }
  }],
  ['POST', /^\/api\/learn\/sessions$/, ({ body }) => {
    const b = body as { skill_id: string; lang: string }
    skillOr404(b.skill_id)
    const id = rid('ls')
    db.sessions.set(id, { skill_id: b.skill_id, lang: b.lang })
    return { session_id: id }
  }],
  ['POST', /^\/api\/learn\/sessions\/([\w-]+)\/complete$/, ({ m, body }) => {
    const sess = db.sessions.get(m[1])
    if (!sess) throw notFound(`session ${m[1]}`)
    const s = skillOr404(sess.skill_id)
    const answers = (body as { quiz_answers: number[] }).quiz_answers ?? []
    const quiz = s.quiz.length ? s.quiz : quizSort
    const right = quiz.filter((q, i) => answers[i] === q.answer).length
    const score = quiz.length ? right / quiz.length : 1
    return { score, passed: score >= 0.66, certificate: score >= 0.66 ? '/mock/certs/sample.svg' : null }
  }],
  ['GET', /^\/api\/learn\/progress$/, () => seedProgress()],
  ['POST', /^\/api\/tutor\/([\w-]+)\/ask$/, ({ m, body, form }) => {
    skillOr404(m[1])
    const question = form ? 'How do I know which bracket variant to use?' : (body as { question: string }).question
    const { text, sources } = tutorAnswer(question)
    const words = text.split(/(?<= )/)
    const events: { event: string; data: unknown }[] = []
    if (form) events.push({ event: 'transcript', data: { text: question } })
    for (const w of words) events.push({ event: 'delta', data: { text: w } })
    events.push({
      event: 'done',
      data: { text, audio: silentWav(text.length / 15), sources, served_by: [...(form ? served('Whisper large-v3', 1, 171) : []), ...served('gpt-oss-20b', 2, 1890), ...served('S2 Pro', 1, 101)] },
    })
    return sse(events)
  }],

  ['GET', /^\/api\/robot\/scene$/, async () => (await import('./robot')).mockScene()],
  ['GET', /^\/api\/robot\/([\w-]+)$/, ({ m }) => {
    const s = skillOr404(m[1])
    return { program: s.robot.program, policy: s.robot.policy, runs: db.runs.get(s.id) ?? [] }
  }],
  ['POST', /^\/api\/robot\/([\w-]+)\/train$/, ({ m }) => {
    const s = skillOr404(m[1])
    s.robot.policy = { ...s.robot.policy, status: 'training' }
    return {
      job_id: startJob('train', s.id, () => {
        s.robot.policy = { status: 'trained', success_rate: s.robot.policy.success_rate, trials: s.robot.policy.trials, trained_at: new Date().toISOString() }
      }),
    }
  }],
  ['POST', /^\/api\/robot\/([\w-]+)\/evaluate$/, ({ m }) => {
    const s = skillOr404(m[1])
    return {
      job_id: startJob('evaluate', s.id, () => {
        const t = evalTrials()
        s.robot.policy = { ...s.robot.policy, success_rate: t.filter((x) => x.success).length / t.length, trials: t.length }
      }),
    }
  }],
  ['POST', /^\/api\/robot\/([\w-]+)\/run$/, ({ m, body }) => {
    const s = skillOr404(m[1])
    const mode = (body as { mode: 'replay' | 'policy' | 'gr00t' | 'scripted' }).mode
    const id = rid('rr')
    const runs = db.runs.get(s.id) ?? []
    runs.unshift({ id, mode, success: null, at: new Date().toISOString() })
    db.runs.set(s.id, runs)
    return { run_id: id }
  }],

  ['GET', /^\/api\/exchange\/listings$/, ({ url }) => {
    const q = (url.searchParams.get('q') ?? '').toLowerCase()
    const industry = url.searchParams.get('industry')
    const robot = url.searchParams.get('robot')
    const verified = url.searchParams.get('verified')
    return [...db.listings.values()]
      .filter((l) => !q || `${l.title} ${l.summary} ${l.plant} ${l.expert.name}`.toLowerCase().includes(q))
      .filter((l) => !industry || l.industry === industry)
      .filter((l) => !robot || l.robot_types.includes(robot))
      .filter((l) => verified !== 'true' || l.verified)
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
  }],
  ['GET', /^\/api\/exchange\/listings\/([\w-]+)$/, ({ m }) => {
    const l = db.listings.get(m[1])
    if (!l) throw notFound(`listing ${m[1]}`)
    return listingDetail(l, [...db.skills.values()])
  }],
  ['POST', /^\/api\/exchange\/listings$/, ({ body }) => {
    const b = body as CreateListing
    const s = skillOr404(b.skill_id)
    if (s.verification.status !== 'verified') throw new HttpError(400, 'bad_request', 'Only verified skills can be listed')
    if (b.consent.raw_video) throw new HttpError(400, 'bad_request', 'Raw video is never shared')
    const l: Listing = {
      id: rid('lst'), skill_id: s.id, title: s.title, summary: s.summary, thumb: summarize(s).thumb,
      preview_video: s.source.video, expert: { id: s.expert.id, name: s.expert.name }, plant: 'Fremont Assembly',
      industry: b.industry, robot_types: b.robot_types, verified: true, consent: { ...b.consent, signed_by: s.expert.id, signed_at: new Date().toISOString() },
      price: b.price, currency: 'USD', royalty_split: b.royalty_split, licenses_sold: 0, rating: null,
      created_at: new Date().toISOString(), demo: false,
    }
    db.listings.set(l.id, l)
    s.listing_id = l.id
    return l
  }],
  ['POST', /^\/api\/exchange\/listings\/([\w-]+)\/license$/, ({ m, body, user }) => {
    const l = db.listings.get(m[1])
    if (!l) throw notFound(`listing ${m[1]}`)
    const type = (body as { license_type: LicenseType }).license_type
    const amount = l.price[type]
    if (amount === undefined) throw new HttpError(400, 'bad_request', 'unknown license type')
    const id = rid('lic')
    const royalties = [
      { to: l.expert.id, amount: Math.round(amount * l.royalty_split.expert * 100) / 100 },
      { to: 'plant', amount: Math.round(amount * l.royalty_split.plant * 100) / 100 },
    ]
    l.licenses_sold += 1
    const lib = db.library.get(user) ?? []
    lib.unshift({ license: { id, listing_id: l.id, license_type: type, buyer_id: user, amount, currency: l.currency, created_at: new Date().toISOString(), download: `/api/exchange/licenses/${id}/pack.zip` }, listing: l })
    db.library.set(user, lib)
    db.earnings.push({ at: new Date().toISOString(), listing_id: l.id, skill_title: l.title, buyer: users.find((u) => u.id === user)?.name ?? user, license_type: type, amount: royalties[0].amount })
    return { license_id: id, receipt: { amount, currency: l.currency, royalties }, download: `/api/exchange/licenses/${id}/pack.zip` }
  }],
  ['GET', /^\/api\/exchange\/library$/, ({ user }) => db.library.get(user) ?? []],
  ['GET', /^\/api\/exchange\/licenses\/([\w-]+)\/pack\.zip$/, ({ m }) =>
    new Response(new Blob([`Tacit skill pack ${m[1]} (mock)`], { type: 'application/zip' }), { headers: { 'Content-Type': 'application/zip' } })],
  ['GET', /^\/api\/earnings$/, ({ user }) => {
    const entries = db.earnings
      .filter(() => user === 'u_maria')
      .slice()
      .sort((a, b) => b.at.localeCompare(a.at))
    const months = new Map<string, number>()
    for (const e of entries) months.set(e.at.slice(0, 7), (months.get(e.at.slice(0, 7)) ?? 0) + e.amount)
    const by_month = [...months.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([k, v]) => [k, Math.round(v * 100) / 100])
    return { total: Math.round(entries.reduce((s, e) => s + e.amount, 0) * 100) / 100, currency: 'USD', by_month, entries }
  }],
]

export async function mockFetch(path: string, init: RequestInit): Promise<Response> {
  const url = new URL(path, location.origin)
  const method = (init.method ?? 'GET').toUpperCase()
  const headers = new Headers(init.headers)
  const user = headers.get('X-Tacit-User') ?? 'u_maria'
  const form = init.body instanceof FormData ? init.body : null
  const body = typeof init.body === 'string' ? JSON.parse(init.body) : undefined
  await new Promise((r) => setTimeout(r, 60 + Math.random() * 140))
  for (const [mth, re, handler] of routes) {
    if (mth !== method) continue
    const m = url.pathname.match(re)
    if (!m) continue
    try {
      const out = await handler({ m, url, body, form, user })
      if (out instanceof Response) return out
      return new Response(JSON.stringify(out), { status: 200, headers: { 'Content-Type': 'application/json' } })
    } catch (err) {
      const e = err instanceof HttpError ? err : new HttpError(500, 'internal', (err as Error).message)
      return new Response(JSON.stringify({ error: { code: e.code, message: e.message, detail: {} } }), {
        status: e.status,
        headers: { 'Content-Type': 'application/json' },
      })
    }
  }
  return new Response(JSON.stringify({ error: { code: 'not_found', message: `${method} ${url.pathname}`, detail: {} } }), {
    status: 404,
    headers: { 'Content-Type': 'application/json' },
  })
}
