import { useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useApp } from '@/lib/store'
import { Hero } from './landing/Hero'
import { FlowSection } from './landing/FlowSection'
import { BoxSection } from './landing/BoxSection'
import { UseCases } from './landing/UseCases'
import { Moat } from './landing/Moat'
import { Cta, ExchangePreview, Footer } from './landing/Closing'

export default function Landing() {
  const [params, setParams] = useSearchParams()
  const openTour = useApp((s) => s.openTour)
  useEffect(() => {
    if (params.get('tour') === '1') {
      setParams({}, { replace: true })
      openTour(0)
    }
  }, [params, setParams, openTour])
  return (
    <div id="main" data-testid="page-landing">
      <Hero />
      <FlowSection />
      <BoxSection />
      <UseCases />
      <Moat />
      <ExchangePreview />
      <Cta />
      <Footer />
    </div>
  )
}
