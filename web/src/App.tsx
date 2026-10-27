import { lazy, Suspense, useEffect, type ReactNode } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { TopBar } from '@/components/layout/TopBar'
import { Tour } from '@/components/layout/Tour'
import { Toaster } from '@/components/ui'
import { LogoMark } from '@/components/layout/Logo'

const Landing = lazy(() => import('@/pages/Landing'))
const Studio = lazy(() => import('@/pages/Studio'))
const Skills = lazy(() => import('@/pages/Skills'))
const SkillDetail = lazy(() => import('@/pages/SkillDetail'))
const Learn = lazy(() => import('@/pages/Learn'))
const Lesson = lazy(() => import('@/pages/Lesson'))
const Team = lazy(() => import('@/pages/Team'))
const RobotIndex = lazy(() => import('@/pages/RobotIndex'))
const RobotLab = lazy(() => import('@/pages/RobotLab'))
const Exchange = lazy(() => import('@/pages/Exchange'))
const ListingPage = lazy(() => import('@/pages/Listing'))
const Sell = lazy(() => import('@/pages/Sell'))
const Library = lazy(() => import('@/pages/Library'))
const Earnings = lazy(() => import('@/pages/Earnings'))
const BoxPage = lazy(() => import('@/pages/Box'))
const NotFound = lazy(() => import('@/pages/NotFound'))

function PageFallback() {
  return (
    <div className="grid min-h-[60vh] place-items-center" aria-busy="true" aria-label="Loading">
      <LogoMark size={28} className="animate-pulse" />
    </div>
  )
}

function Transition({ children }: { children: ReactNode }) {
  return (
    <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}>
      {children}
    </motion.div>
  )
}

const TITLES: [RegExp, string][] = [
  [/^\/$/, 'Tacit · Teach a robot by showing it'],
  [/^\/studio/, 'Studio · Tacit'],
  [/^\/skills\/./, 'Skill · Tacit'],
  [/^\/skills/, 'Skills · Tacit'],
  [/^\/learn/, 'Learn · Tacit'],
  [/^\/team/, 'Team · Tacit'],
  [/^\/robot/, 'Robot Lab · Tacit'],
  [/^\/exchange/, 'Skill Exchange · Tacit'],
  [/^\/library/, 'Library · Tacit'],
  [/^\/earnings/, 'Earnings · Tacit'],
  [/^\/box/, 'Box · Tacit'],
]

export default function App() {
  const location = useLocation()
  useEffect(() => {
    document.title = TITLES.find(([re]) => re.test(location.pathname))?.[1] ?? 'Tacit'
    if (!location.hash) window.scrollTo({ top: 0 })
  }, [location.pathname, location.hash])
  // Route groups share one key so tab changes inside a page do not replay the transition.
  const key = location.pathname.split('/').slice(0, 3).join('/')
  return (
    <div className="relative min-h-screen">
      <a href="#main" className="sr-only z-[90] rounded-md bg-ion px-3 py-2 text-ion-ink focus:not-sr-only focus:fixed focus:top-2 focus:left-2">
        Skip to content
      </a>
      <TopBar />
      <Suspense fallback={<PageFallback />}>
        <AnimatePresence mode="wait" initial={false}>
          <Transition key={key}>
            <Routes location={location}>
              <Route path="/" element={<Landing />} />
              <Route path="/studio" element={<Studio />} />
              <Route path="/skills" element={<Skills />} />
              <Route path="/skills/:id" element={<SkillDetail />} />
              <Route path="/learn" element={<Learn />} />
              <Route path="/learn/:skillId" element={<Lesson />} />
              <Route path="/team" element={<Team />} />
              <Route path="/robot" element={<RobotIndex />} />
              <Route path="/robot/:skillId" element={<RobotLab />} />
              <Route path="/exchange" element={<Exchange />} />
              <Route path="/exchange/sell/:skillId" element={<Sell />} />
              <Route path="/exchange/:listingId" element={<ListingPage />} />
              <Route path="/library" element={<Library />} />
              <Route path="/earnings" element={<Earnings />} />
              <Route path="/box" element={<BoxPage />} />
              <Route path="/home" element={<Navigate to="/" replace />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </Transition>
        </AnimatePresence>
      </Suspense>
      <Tour />
      <Toaster />
    </div>
  )
}
