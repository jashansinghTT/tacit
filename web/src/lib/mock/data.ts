// Seed data for mock mode. Shapes follow docs/API.md exactly; content mirrors the seeded demo.
import type {
  BoxStatus,
  EarningsEntry,
  LicenseType,
  Listing,
  ListingDetail,
  ProgressRow,
  QA,
  Sample,
  Skill,
  SkillSummary,
  Step,
  User,
} from '../api/types'
import { SCENE_DURATION, STEP_TIMES } from './scene'

export const M = '/mock'

export const users: User[] = [
  { id: 'u_maria', name: 'Maria Chen', role: 'expert', title: 'Senior assembler, 22 years', avatar: `${M}/avatars/maria.svg` },
  { id: 'u_sam', name: 'Sam Okafor', role: 'trainee', title: 'New hire, week 2', avatar: `${M}/avatars/sam.svg` },
  { id: 'u_priya', name: 'Priya Raman', role: 'manager', title: 'Plant manager, Fremont', avatar: `${M}/avatars/priya.svg` },
  { id: 'u_atlas', name: 'Atlas Robotics', role: 'buyer', title: 'Robot maker, Boston', avatar: `${M}/avatars/atlas.svg` },
]

export const samples: Sample[] = [
  { id: 'smp_sort', title: 'Kitting an M6 bracket set', video: `${M}/samples/sort.mp4`, thumb: `${M}/samples/sort.jpg`, duration: SCENE_DURATION, kind: 'real' },
  { id: 'smp_fake', title: 'The same task, AI-generated', video: `${M}/samples/fake.mp4`, thumb: `${M}/samples/fake.jpg`, duration: 12.0, kind: 'ai-generated' },
]

const maria = { id: 'u_maria', name: 'Maria Chen', title: 'Senior assembler' }

function iso(daysAgo: number, hour = 10) {
  const d = new Date(Date.UTC(2026, 9, 27, hour, 12, 0))
  d.setUTCDate(d.getUTCDate() - daysAgo)
  return d.toISOString().replace('.000', '')
}

// ---------------------------------------------------------------------------------------------
// The flagship skill: kitting, built from the procedural scene so tracks and twin match it.

const sortSteps: Step[] = (
  [
  {
    instruction: 'Read the work order card before touching any parts. Note the kit number and the bracket variant.',
    why: 'Two bracket variants look almost the same. The order tells you which one, and you only want to find out once.',
    why_source: 'expert', objects: ['work order'], hand: null, gaze_target: 'work order',
    tips: ['The variant code is the last two letters of the kit number.'],
  },
  {
    instruction: 'With your left hand, take one bracket from the blue bin, holes facing up.',
    why: 'The blue bin holds the pre-drilled brackets. Holes up means you never have to turn it over in the tray.',
    why_source: 'expert', objects: ['bracket', 'blue bin'], hand: 'left', gaze_target: 'blue bin',
    tips: ['Pinch the long edge; the short edge is sharp.', 'Take from the front of the bin so the pile stays level.'],
  },
  {
    instruction: 'Seat the bracket flat in slot A, short edge toward you, then let go.',
    why: 'Slot A is shaped for the bracket. If it rocks, it is the wrong variant, and you have caught it before the line does.',
    why_source: 'expert', objects: ['bracket', 'kit tray'], hand: 'left', gaze_target: 'kit tray',
    tips: ['Press the centre once; it should not rock.'],
  },
  {
    instruction: 'With your right hand, pick exactly two M6 bolts from the orange bin.',
    why: 'Grab two by feel and roll them in your fingers to count; you save a look at the bin every cycle.',
    why_source: 'inferred', objects: ['bolt', 'orange bin'], hand: 'right', gaze_target: 'orange bin',
    tips: ['If you feel three, drop one back before you lift.'],
  },
  {
    instruction: 'Drop the two bolts into slot B from just above the tray.',
    why: 'From a few centimetres they do not bounce out, and the tray stays quiet so the next station can hear the count.',
    why_source: 'inferred', objects: ['bolt', 'kit tray'], hand: 'right', gaze_target: 'kit tray',
    tips: [],
  },
  {
    instruction: 'Look over both slots, then push the tray straight forward to the outbound rail with both hands.',
    why: 'A last look catches a missing bolt here, not at final assembly where it costs a stopped line.',
    why_source: 'expert', objects: ['kit tray'], hand: 'both', gaze_target: 'kit tray',
    tips: ['Push from both short edges so the bolts do not slide.'],
  },
  ] as Omit<Step, 'id' | 'index' | 't_start' | 't_end' | 'title' | 'keyframe'>[]
).map((s, i) => ({
  id: `st${i + 1}`,
  index: i + 1,
  t_start: STEP_TIMES[i].t0,
  t_end: STEP_TIMES[i].t1,
  title: STEP_TIMES[i].title,
  keyframe: `${M}/skills/sk_sort/kf_0${i + 1}.jpg`,
  ...s,
}))

const sortQa: QA[] = [
  { id: 'q1', step_id: 'st1', t: 4.6, question: 'You read the whole card before reaching for anything. What are you checking?', question_audio: null, answer: 'The variant. B4 and B6 brackets look the same from the top, and the card is the only place it says which.', answer_audio: null },
  { id: 'q2', step_id: 'st2', t: 9.8, question: 'Why the blue bin and not the grey one next to it?', question_audio: null, answer: 'Blue is pre-drilled. The grey ones still need the second hole, they go to station four.', answer_audio: null },
  { id: 'q3', step_id: 'st3', t: 15.9, question: 'You pressed the bracket once after placing it. Why?', question_audio: null, answer: 'If it rocks, it is the wrong variant. Better I find it than the line.', answer_audio: null },
  { id: 'q4', step_id: 'st4', t: 22.0, question: 'How do you know you have exactly two bolts without looking?', question_audio: null, answer: null, answer_audio: null },
  { id: 'q5', step_id: 'st5', t: 28.6, question: 'Why drop them from that height?', question_audio: null, answer: null, answer_audio: null },
]

const sortSop = `# Kit an M6 bracket set

**Station** Kitting 2 · **Takt** 38 s · **Expert** Maria Chen · **Verified** VGGT 0.94

Standard work generated from a recorded demonstration on the Tacit box. Raw video stays on the box.

## Before you start
- Tray is empty and on the left rail.
- Blue bin (pre-drilled brackets) and orange bin (M6 × 16 bolts) are at least half full.
- The work order card is on the mat, text facing you.

## Steps
1. **Read the work order.** Note the kit number and the bracket variant (last two letters).
2. **Pick a bracket from the blue bin** with your left hand, holes facing up. Pinch the long edge.
3. **Seat the bracket in slot A**, short edge toward you. Press the centre once: it must not rock.
4. **Pick two M6 bolts from the orange bin** with your right hand. Count by feel.
5. **Drop the bolts into slot B** from a few centimetres above the tray.
6. **Check the kit and push it to outbound**, both hands on the short edges.

## Quality checks
| Check | When | Pass |
|---|---|---|
| Bracket variant matches the card | Step 3 | Bracket sits flat, no rocking |
| Bolt count | Step 6 | Exactly two in slot B |

## Safety
- The bracket's short edge is sharp. Handle it by the long edge.
- Keep fingers clear of the rail when pushing the tray out.
`

export const quizSort = [
  { q: 'Where do you find which bracket variant goes in this kit?', choices: ['On the bracket itself', 'The last two letters of the kit number on the work order', 'Ask the next station'], answer: 1, explain: 'Both variants look the same from the top; only the work order says which.' },
  { q: 'A bracket rocks when you press it in slot A. What does that mean?', choices: ['Press harder', 'It is the wrong variant', 'The tray is dirty'], answer: 1, explain: 'Slot A is shaped for the right variant. Rocking means you caught a wrong part.' },
  { q: 'How many bolts go into slot B?', choices: ['One', 'Two', 'Four'], answer: 1, explain: 'Exactly two M6 × 16 bolts per kit.' },
]

function sortSkill(): Skill {
  return {
    id: 'sk_sort',
    title: 'Kit an M6 bracket set',
    summary: 'Pick a pre-drilled bracket and two M6 bolts into the kit tray, check it and send it to outbound. One 38-second cycle at Kitting 2.',
    status: 'ready',
    created_at: iso(9, 14),
    expert: maria,
    source: { kind: 'sample', video: `${M}/samples/sort.mp4`, fps: 30, duration: SCENE_DURATION, width: 1280, height: 720 },
    consent: { motion: true, gaze: true, voice_text: true, raw_video: false, signed_by: 'u_maria', signed_at: iso(9, 15) },
    steps: sortSteps,
    qa: sortQa,
    sop_markdown: sortSop,
    quiz: quizSort,
    safety: ['Handle brackets by the long edge; the short edge is sharp.', 'Keep fingers clear of the outbound rail when pushing the tray.'],
    verification: {
      status: 'verified', score: 0.94, method: 'VGGT multi-view consistency',
      details: { views: 4, reproj_px: 1.6, depth_stability: 0.96 }, checked_at: iso(9, 15),
      pointcloud: '/api/skills/sk_sort/pointcloud',
    },
    robot: {
      program: [
        { op: 'pick', object: 'bracket' }, { op: 'place', target: 'slot A' },
        { op: 'pick', object: 'bolt' }, { op: 'place', target: 'slot B' },
      ],
      policy: { status: 'trained', success_rate: 0.9, trials: 20, trained_at: iso(8, 11) },
      gr00t: { last_run: iso(8, 12) },
    },
    listing_id: 'lst_sort',
    models_used: [
      { model: 'MediaPipe', chip: null, calls: 382, p50_ms: 8.7, backend: 'cpu' },
      { model: 'HaMeR', chip: 0, calls: 764, p50_ms: 4.8, backend: 'tt' },
      { model: 'Gaze-LLE', chip: 0, calls: 382, p50_ms: 7.1, backend: 'tt' },
      { model: 'RF-DETR', chip: 0, calls: 382, p50_ms: 11.9, backend: 'tt' },
      { model: 'VGGT-1B', chip: 0, calls: 1, p50_ms: 412, backend: 'tt' },
      { model: 'gpt-oss-20b', chip: 2, calls: 14, p50_ms: 2140, backend: 'tt' },
      { model: 'S2 Pro', chip: 1, calls: 11, p50_ms: 96, backend: 'tt' },
      { model: 'Whisper large-v3', chip: 1, calls: 3, p50_ms: 182, backend: 'tt' },
    ],
  }
}

// ---------------------------------------------------------------------------------------------
// Other seeded skills: same shape, fewer details.

interface Brief {
  id: string
  title: string
  summary: string
  steps: [string, string, string][]
  daysAgo: number
  score: number
  status?: Skill['status']
  verification?: 'verified' | 'suspect' | 'pending'
  listing?: string | null
  safety?: string[]
  expert?: Skill['expert']
  policy?: Skill['robot']['policy']
}

function briefSkill(b: Brief): Skill {
  const dur = b.steps.length * 6.4
  const steps: Step[] = b.steps.map(([title, instruction, why], i) => ({
    id: `st${i + 1}`, index: i + 1, t_start: i * 6.4, t_end: (i + 1) * 6.4, title, instruction, why,
    why_source: i % 3 === 1 ? 'inferred' : 'expert',
    keyframe: `${M}/skills/sk_sort/kf_0${(i % 6) + 1}.jpg`,
    objects: [], hand: i % 2 ? 'right' : 'left', gaze_target: null, tips: [],
  }))
  return {
    id: b.id, title: b.title, summary: b.summary, status: b.status ?? 'ready', created_at: iso(b.daysAgo),
    expert: b.expert ?? maria,
    source: { kind: 'sample', video: `${M}/samples/sort.mp4`, fps: 30, duration: dur, width: 1280, height: 720 },
    consent: { motion: true, gaze: true, voice_text: true, raw_video: false, signed_by: b.expert?.id ?? 'u_maria', signed_at: iso(b.daysAgo) },
    steps, qa: steps.slice(0, 2).map((s, i) => ({ id: `q${i + 1}`, step_id: s.id, t: s.t_end - 1, question: `Why ${s.title.toLowerCase()} that way?`, question_audio: null, answer: i === 0 ? s.why : null, answer_audio: null })),
    sop_markdown: `# ${b.title}\n\n${b.summary}\n\n## Steps\n${steps.map((s) => `${s.index}. **${s.title}.** ${s.instruction}`).join('\n')}\n\n## Safety\n${(b.safety ?? ['Wear safety glasses.']).map((s) => `- ${s}`).join('\n')}\n`,
    quiz: [{ q: `What is the first step of "${b.title}"?`, choices: [steps[0].title, steps[steps.length - 1].title], answer: 0, explain: steps[0].why }],
    safety: b.safety ?? ['Wear safety glasses.'],
    verification: {
      status: b.verification ?? 'verified', score: b.score, method: 'VGGT multi-view consistency',
      details: b.verification === 'suspect' ? { views: 4, reproj_px: 9.7, depth_stability: 0.41 } : { views: 4, reproj_px: 1.9, depth_stability: 0.93 },
      checked_at: iso(b.daysAgo), pointcloud: `/api/skills/${b.id}/pointcloud`,
    },
    robot: {
      program: [{ op: 'pick', object: 'part' }, { op: 'place', target: 'fixture' }],
      policy: b.policy ?? { status: 'untrained', success_rate: null, trials: null, trained_at: null },
      gr00t: { last_run: null },
    },
    listing_id: b.listing ?? null,
    models_used: sortSkill().models_used.map((m) => ({ ...m, calls: Math.round(m.calls * (dur / SCENE_DURATION)) })),
  }
}

const valve = briefSkill({
  id: 'sk_valve', title: 'Isolate and open the coolant valve', daysAgo: 21, score: 0.91, listing: 'lst_valve',
  summary: 'Lock out the pump, confirm zero pressure on the gauge, then open the coolant valve a quarter turn at a time.',
  steps: [
    ['Lock out the pump', 'Turn the pump isolator to OFF and hang your tag on it.', 'A running pump behind a closed valve is the one thing that can hurt you here.'],
    ['Read the gauge', 'Wait until the gauge needle settles at zero.', 'The line holds pressure for about ten seconds after the pump stops.'],
    ['Crack the valve', 'Open the valve a quarter turn and listen.', 'A hiss means trapped pressure: close it and wait again.'],
    ['Open fully', 'Open the rest of the way in quarter turns.', 'Quarter turns keep the flow from slamming the filter.'],
  ],
  safety: ['Check the gauge before opening the valve.', 'Lock out and tag the pump before you start.'],
  policy: { status: 'trained', success_rate: 0.85, trials: 20, trained_at: iso(19) },
})

const bearing = briefSkill({
  id: 'sk_bearing', title: 'Press a bearing into the housing', daysAgo: 4, score: 0.92,
  summary: 'Seat a 6204 bearing square in the housing with the arbor press, without loading the races.',
  steps: [
    ['Wipe the bore', 'Wipe the housing bore with a lint-free cloth.', 'One grain of swarf in the bore cocks the bearing.'],
    ['Square the bearing', 'Set the bearing on the bore, lettering up, and check it is square by eye.', 'Lettering up tells the next person which way it went in.'],
    ['Press on the outer race', 'Use the outer-race driver and press in one smooth stroke.', 'Pressing on the inner race loads the balls and ruins it.'],
    ['Spin check', 'Spin the bearing with a finger: it should run free and quiet.', 'A rough spin means it went in cocked.'],
  ],
  safety: ['Keep both hands on the press handle during the stroke.'],
})

const fake = briefSkill({
  id: 'sk_fake', title: 'Kitting clip (AI-generated)', daysAgo: 2, score: 0.31, verification: 'suspect',
  summary: 'An AI-generated video of the kitting task, uploaded to test verification. It does not rebuild into one rigid scene.',
  steps: [
    ['Pick a bracket', 'Pick a bracket from the bin.', 'Inferred from the clip.'],
    ['Place it in the tray', 'Place the bracket in the tray.', 'Inferred from the clip.'],
  ],
})
fake.source = { kind: 'upload', video: `${M}/samples/fake.mp4`, fps: 24, duration: 12, width: 1280, height: 720 }

const flange = briefSkill({
  id: 'sk_flange', title: 'Torque a flange in a star pattern', daysAgo: 0, score: 0, status: 'processing', verification: 'pending',
  summary: 'Captured live this morning; processing on the box.',
  steps: [
    ['Hand-start all bolts', 'Thread all eight bolts by hand.', 'Inferred from the clip.'],
    ['First pass at 30%', 'Torque in a star pattern to 30%.', 'Inferred from the clip.'],
    ['Final pass', 'Repeat at 100% in the same order.', 'Inferred from the clip.'],
  ],
})

export function seedSkills(): Skill[] {
  return [sortSkill(), bearing, valve, fake, flange]
}

export function summarize(s: Skill): SkillSummary {
  return {
    id: s.id, title: s.title, summary: s.summary, status: s.status, created_at: s.created_at,
    expert: { id: s.expert.id, name: s.expert.name },
    thumb: s.id === 'sk_fake' ? `${M}/samples/fake.jpg` : s.steps[1]?.keyframe ?? s.steps[0]?.keyframe ?? null,
    duration: s.source.duration, steps_count: s.steps.length, verification_status: s.verification.status,
    listed: Boolean(s.listing_id),
  }
}

// ---------------------------------------------------------------------------------------------
// Exchange

interface ListingSeed {
  id: string
  skill_id: string
  title: string
  summary: string
  expert: { id: string; name: string }
  plant: string
  industry: string
  robot_types: string[]
  price: Record<LicenseType, number>
  sold: number
  rating: number | null
  daysAgo: number
  demo: boolean
  thumb: number
}

const listingSeeds: ListingSeed[] = [
  { id: 'lst_sort', skill_id: 'sk_sort', title: 'Kit an M6 bracket set', summary: 'Two-handed kitting from bins into a slotted tray, with a variant check. 6 steps, 38 s cycle.', expert: maria, plant: 'Fremont Assembly', industry: 'Electronics assembly', robot_types: ['franka', 'ur5'], price: { training: 49, robot_deploy: 499, exclusive: 9900 }, sold: 7, rating: 4.8, daysAgo: 8, demo: false, thumb: 2 },
  { id: 'lst_valve', skill_id: 'sk_valve', title: 'Isolate and open the coolant valve', summary: 'Lockout, gauge check and a staged valve opening. Safety-critical gaze checks included.', expert: maria, plant: 'Fremont Assembly', industry: 'Maintenance', robot_types: ['franka'], price: { training: 39, robot_deploy: 349, exclusive: 6900 }, sold: 3, rating: 4.6, daysAgo: 19, demo: false, thumb: 1 },
  { id: 'lst_pcb', skill_id: 'sk_ext_pcb', title: 'Seat a PCB in an edge connector', summary: 'Angle-in, rock-down insertion with a latch check. Fine wrist motion, 4 steps.', expert: { id: 'x_lucia', name: 'Lucía Herrera' }, plant: 'Monterrey Electronics', industry: 'Electronics assembly', robot_types: ['franka', 'ur5', 'kinova'], price: { training: 59, robot_deploy: 649, exclusive: 12900 }, sold: 12, rating: 4.9, daysAgo: 33, demo: true, thumb: 3 },
  { id: 'lst_harness', skill_id: 'sk_ext_harness', title: 'Route a cable harness through clips', summary: 'Two-handed routing with tension control across six clips on a board.', expert: { id: 'x_bence', name: 'Bence Kovács' }, plant: 'Győr Automotive', industry: 'Automotive', robot_types: ['ur5'], price: { training: 69, robot_deploy: 790, exclusive: 14500 }, sold: 5, rating: 4.7, daysAgo: 41, demo: true, thumb: 4 },
  { id: 'lst_carton', skill_id: 'sk_ext_carton', title: 'Fold and tape a shipping carton', summary: 'Flap order, square check and a single tape pass. A good first deformable-object skill.', expert: { id: 'x_tanya', name: 'Tanya Brooks' }, plant: 'Memphis Fulfilment', industry: 'Logistics', robot_types: ['franka', 'ur5'], price: { training: 29, robot_deploy: 299, exclusive: 4900 }, sold: 18, rating: 4.5, daysAgo: 55, demo: true, thumb: 5 },
  { id: 'lst_vials', skill_id: 'sk_ext_vials', title: 'Rack vials without touching the caps', summary: 'Pick-and-place of 2 ml vials into a 50-well rack, grip below the cap. Cleanroom gaze checks.', expert: { id: 'x_mei', name: 'Mei Tanaka' }, plant: 'Basel Fill & Finish', industry: 'Pharma', robot_types: ['franka', 'kinova'], price: { training: 79, robot_deploy: 990, exclusive: 18000 }, sold: 9, rating: 5.0, daysAgo: 12, demo: true, thumb: 6 },
  { id: 'lst_fixture', skill_id: 'sk_ext_fixture', title: 'Load a part into a CNC vise', summary: 'Clean the jaws, seat on parallels, tap down and torque. Includes the chip-clearing step.', expert: { id: 'x_kenji', name: 'Kenji Mori' }, plant: 'Nagoya Machining', industry: 'Machining', robot_types: ['ur5'], price: { training: 49, robot_deploy: 590, exclusive: 9900 }, sold: 4, rating: 4.4, daysAgo: 27, demo: true, thumb: 1 },
]

export function seedListings(): Listing[] {
  return listingSeeds.map((l) => ({
    id: l.id, skill_id: l.skill_id, title: l.title, summary: l.summary,
    thumb: `${M}/skills/sk_sort/kf_0${l.thumb}.jpg`, preview_video: `${M}/samples/sort.mp4`,
    expert: l.expert, plant: l.plant, industry: l.industry, robot_types: l.robot_types, verified: true,
    consent: { motion: true, gaze: true, voice_text: true, raw_video: false, signed_by: l.expert.id, signed_at: iso(l.daysAgo) },
    price: l.price, currency: 'USD', royalty_split: { expert: 0.7, plant: 0.3 }, licenses_sold: l.sold,
    rating: l.rating, created_at: iso(l.daysAgo), demo: l.demo,
  }))
}

export function listingDetail(l: Listing, skills: Skill[]): ListingDetail {
  const own = skills.find((s) => s.id === l.skill_id)
  const skill: Skill = own ?? {
    ...briefSkill({
      id: l.skill_id, title: l.title, summary: l.summary, daysAgo: 30, score: 0.93,
      expert: { ...l.expert, title: 'Expert' },
      steps: [
        ['Prepare', 'Set out the parts as the card shows.', 'A fixed layout means the hands never search.'],
        ['Main motion', l.summary, 'Recorded from the expert.'],
        ['Check', 'Check the result against the reference.', 'Catch it here, not downstream.'],
      ],
      policy: { status: 'trained', success_rate: 0.88, trials: 20, trained_at: iso(20) },
    }),
  }
  const safeSkill: Skill = { ...skill, source: { ...skill.source, video: null } }
  return {
    ...l,
    skill: safeSkill,
    contents: { episodes: 200, hours_of_motion: Math.round(skill.source.duration * 200 / 36) / 100, formats: ['tacit-json', 'lerobot'] },
    terms: `Demo licence. The licensee may use the motion, gaze and text data of "${l.title}" to train and evaluate robot policies and training material, under the licence type purchased. Raw video and face data are not included and never leave the plant. Royalties: ${Math.round(l.royalty_split.expert * 100)}% to the expert, ${Math.round(l.royalty_split.plant * 100)}% to the plant. No payment is taken in this demo.`,
  }
}

const buyers = ['Atlas Robotics', 'Halcyon Arms', 'Northwind Automation', 'Kestrel Labs', 'Brightline Robotics']

export function seedEarnings(): EarningsEntry[] {
  const rows: [number, string, LicenseType, number][] = [
    [96, 'lst_valve', 'training', 39], [88, 'lst_valve', 'robot_deploy', 349], [71, 'lst_valve', 'training', 39],
    [64, 'lst_sort', 'training', 49], [52, 'lst_sort', 'training', 49], [44, 'lst_sort', 'robot_deploy', 499],
    [37, 'lst_sort', 'training', 49], [30, 'lst_sort', 'robot_deploy', 499], [22, 'lst_sort', 'training', 49],
    [14, 'lst_sort', 'robot_deploy', 499], [6, 'lst_sort', 'training', 49],
  ]
  return rows.map(([d, lid, type, price], i) => ({
    at: iso(d, 9 + (i % 7)), listing_id: lid,
    skill_title: lid === 'lst_sort' ? 'Kit an M6 bracket set' : 'Isolate and open the coolant valve',
    buyer: buyers[i % buyers.length], license_type: type, amount: Math.round(price * 0.7 * 100) / 100,
  }))
}

// ---------------------------------------------------------------------------------------------
// Learn

export const trainees = [
  { id: 'u_sam', name: 'Sam Okafor', title: 'New hire, week 2', avatar: `${M}/avatars/sam.svg` },
  { id: 't_ana', name: 'Ana Souza', title: 'Kitting, week 5', avatar: '' },
  { id: 't_kofi', name: 'Kofi Mensah', title: 'Maintenance, week 1', avatar: '' },
  { id: 't_lena', name: 'Lena Vogel', title: 'Kitting, week 9', avatar: '' },
  { id: 't_ravi', name: 'Ravi Iyer', title: 'Assembly, week 3', avatar: '' },
]

export function seedProgress(): ProgressRow[] {
  const r = (who: number, skill: string, title: string, done: number, total: number, best: number | null, passed: boolean, d: number): ProgressRow => ({
    trainee: trainees[who], skill_id: skill, skill_title: title, steps_done: done, steps_total: total, best_score: best, passed, updated_at: iso(d, 8 + who),
  })
  return [
    r(0, 'sk_sort', 'Kit an M6 bracket set', 4, 6, 0.81, false, 0),
    r(1, 'sk_sort', 'Kit an M6 bracket set', 6, 6, 0.92, true, 3),
    r(3, 'sk_sort', 'Kit an M6 bracket set', 6, 6, 0.95, true, 12),
    r(4, 'sk_sort', 'Kit an M6 bracket set', 2, 6, 0.64, false, 1),
    r(2, 'sk_valve', 'Isolate and open the coolant valve', 3, 4, 0.77, false, 0),
    r(1, 'sk_valve', 'Isolate and open the coolant valve', 4, 4, 0.88, true, 6),
    r(0, 'sk_bearing', 'Press a bearing into the housing', 1, 4, 0.58, false, 0),
  ]
}

// ---------------------------------------------------------------------------------------------
// Box

export function seedBox(): BoxStatus {
  const m = (name: string, role: string, port: number, p50: number, calls: number, dram: number) => ({
    name, role, port, healthy: true, p50_ms: p50, calls, backend: 'tt' as const, dram_gib: dram,
  })
  return {
    host: 'tt-blackhole-01',
    updated_at: new Date().toISOString(),
    chips: [
      { id: 0, board: 'p300c', group: 'tacit-vision', status: 'ok', memory: { dram_gib: 11.6, dram_total_gib: 32, l1_used_kib: 1180, l1_total_kib: 1464 },
        models: [m('HaMeR', '3D hands', 21000, 4.9, 12046, 1.8), m('Gaze-LLE', 'gaze', 21001, 7.1, 6023, 1.3), m('RF-DETR', 'parts and objects', 21002, 11.8, 6023, 1.1), m('VGGT-1B', '3D rebuild, verification', 21003, 412, 37, 7.4)] },
      { id: 1, board: 'p300c', group: 'cohost-speech', status: 'ok', memory: { dram_gib: 14.2, dram_total_gib: 32, l1_used_kib: 1302, l1_total_kib: 1464 },
        models: [m('Whisper large-v3', 'speech to text', 21010, 182, 214, 3.4), m('S2 Pro', 'text to speech', 21011, 96, 388, 6.1), m('MiniMax Music 3', 'lesson intro music', 21012, 2890, 6, 4.7)] },
      { id: 2, board: 'p300c', group: 'gpt-oss-20b', status: 'ok', memory: { dram_gib: 24.9, dram_total_gib: 32 },
        models: [m('gpt-oss-20b', 'coach, writer, tutor', 21020, 38, 1290, 24.9)] },
      { id: 3, board: 'p300c', group: 'gr00t', status: 'ok', memory: { dram_gib: 9.3, dram_total_gib: 32 },
        models: [m('GR00T N1.7', 'robot foundation policy', 21030, 66, 4410, 9.3)] },
    ],
    totals: { models: 9, healthy: 9, chips: 4 },
  }
}
