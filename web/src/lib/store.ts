import { create } from 'zustand'
import { setApiUser } from './api/client'

export type PersonaId = 'u_maria' | 'u_sam' | 'u_priya' | 'u_atlas'

export interface Persona {
  id: PersonaId
  name: string
  role: 'expert' | 'trainee' | 'manager' | 'buyer'
  roleLabel: string
  home: string
}

/** The four demo personas. Names come from /api/users once it answers; these are the fallbacks. */
export const PERSONAS: Persona[] = [
  { id: 'u_maria', name: 'Maria Chen', role: 'expert', roleLabel: 'Expert', home: '/studio' },
  { id: 'u_sam', name: 'Sam Okafor', role: 'trainee', roleLabel: 'Trainee', home: '/learn' },
  { id: 'u_priya', name: 'Priya Raman', role: 'manager', roleLabel: 'Manager', home: '/team' },
  { id: 'u_atlas', name: 'Atlas Robotics', role: 'buyer', roleLabel: 'Buyer', home: '/exchange' },
]

function readPersona(): PersonaId {
  try {
    const v = localStorage.getItem('tacit.persona')
    if (v && PERSONAS.some((p) => p.id === v)) return v as PersonaId
  } catch {
    /* storage unavailable */
  }
  return 'u_maria'
}

interface AppState {
  persona: PersonaId
  setPersona: (id: PersonaId) => void
  tourOpen: boolean
  tourStep: number
  openTour: (step?: number) => void
  setTourStep: (step: number) => void
  closeTour: () => void
  lang: string
  setLang: (l: string) => void
}

const initial = readPersona()
setApiUser(initial)

export const useApp = create<AppState>((set) => ({
  persona: initial,
  setPersona: (id) => {
    setApiUser(id)
    try {
      localStorage.setItem('tacit.persona', id)
    } catch {
      /* ignore */
    }
    set({ persona: id })
  },
  tourOpen: false,
  tourStep: 0,
  openTour: (step = 0) => set({ tourOpen: true, tourStep: step }),
  setTourStep: (step) => set({ tourStep: step }),
  closeTour: () => set({ tourOpen: false }),
  lang: 'en',
  setLang: (lang) => set({ lang }),
}))

export function personaOf(id: string) {
  return PERSONAS.find((p) => p.id === id) ?? PERSONAS[0]
}
