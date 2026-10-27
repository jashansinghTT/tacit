import { useLocation } from 'react-router-dom'
import { ArrowLeft, Compass } from 'lucide-react'
import { Page } from '@/components/layout/Page'
import { ButtonLink } from '@/components/ui'
import { NAV } from '@/components/layout/TopBar'

export default function NotFoundPage() {
  const { pathname } = useLocation()
  return (
    <Page testId="page-notfound">
      <div className="relative mx-auto mt-16 max-w-xl overflow-hidden rounded-2xl panel p-10 text-center">
        <div className="pointer-events-none absolute inset-0 grid-bg opacity-60 fade-mask-b" />
        <div className="relative">
          <div className="mx-auto grid size-12 place-items-center rounded-xl bg-ion-soft text-ion shadow-[inset_0_0_0_1px_rgb(60_215_255/0.3)]">
            <Compass className="size-6" />
          </div>
          <div className="telemetry mt-6 text-sm text-fg-subtle">404 · {pathname}</div>
          <h1 className="mt-2 text-2xl font-medium tracking-tight text-fg">Nothing was captured here</h1>
          <p className="mt-2 text-sm text-fg-muted">The page you asked for does not exist. These do:</p>
          <div className="mt-6 flex flex-wrap justify-center gap-2">
            {NAV.map((n) => (
              <ButtonLink key={n.to} to={n.to} size="sm" variant="outline">
                {n.label}
              </ButtonLink>
            ))}
          </div>
          <ButtonLink to="/" variant="ghost" size="sm" icon={<ArrowLeft className="size-3.5" />} className="mt-6">
            Back to the start
          </ButtonLink>
        </div>
      </div>
    </Page>
  )
}
