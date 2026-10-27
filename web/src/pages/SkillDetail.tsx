import { useEffect } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { Bot, Box as BoxIcon, ClipboardCheck, FileText, GraduationCap, LayoutList, MessageCircleQuestion, ShieldCheck, Store, UserCheck } from 'lucide-react'
import { useJob, useSkill, useTracks, useTwin, qk } from '@/lib/api/queries'
import { fmtDate } from '@/lib/format'
import { usePlayback } from '@/lib/playback'
import { Page, PageHeader } from '@/components/layout/Page'
import { Avatar, Badge, ButtonLink, EmptyState, ErrorState, Panel, Skeleton, Tabs, VerifiedBadge } from '@/components/ui'
import { OverviewTab } from '@/components/skill/OverviewTab'
import { TwinTab } from '@/components/skill/TwinTab'
import { SopTab } from '@/components/skill/SopTab'
import { VerifyTab } from '@/components/skill/VerifyTab'
import { AnswerTab } from '@/components/skill/AnswerTab'
import { AuditTab } from '@/components/skill/AuditTab'
import { ProcessingPanel } from '@/components/skill/ProcessingPanel'

type Tab = 'overview' | 'twin' | 'sop' | 'verify' | 'answer' | 'audit'
const TABS: Tab[] = ['overview', 'twin', 'sop', 'verify', 'answer', 'audit']

export default function SkillDetailPage() {
  const { id } = useParams()
  const [params, setParams] = useSearchParams()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const tab = (TABS.includes(params.get('tab') as Tab) ? params.get('tab') : 'overview') as Tab
  const skill = useSkill(id)
  const s = skill.data
  const ready = s?.status === 'ready'
  const tracks = useTracks(id, ready && (tab === 'overview' || tab === 'twin'))
  const twin = useTwin(id, ready && tab === 'twin')
  const pb = usePlayback(s?.source.duration ?? 1)
  const job = useJob(s?.status === 'processing' ? s.job_id : null, () => {
    void qc.invalidateQueries({ queryKey: qk.skill(id ?? '') })
    void qc.invalidateQueries({ queryKey: ['skills'] })
  })

  useEffect(() => {
    pb.setLoop(null)
    // reset the loop when switching skills
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  if (skill.isError)
    return (
      <Page testId="page-skill">
        <Panel>
          <ErrorState error={skill.error} onRetry={() => skill.refetch()} />
        </Panel>
      </Page>
    )
  if (!s)
    return (
      <Page testId="page-skill">
        <Skeleton className="mb-6 h-20 w-2/3" />
        <Skeleton className="h-[520px]" />
      </Page>
    )

  const pending = s.qa.filter((q) => !q.answer).length
  const setTab = (t: Tab) => setParams(t === 'overview' ? {} : { tab: t }, { replace: true })
  const canList = ready && s.verification.status === 'verified'

  return (
    <Page testId="page-skill" wide>
      <PageHeader
        crumbs={[{ label: 'Skills', to: '/skills' }, { label: s.title }]}
        title={s.title}
        meta={
          <>
            <span className="flex items-center gap-2 text-[13px] text-fg-muted">
              <Avatar name={s.expert.name} size={22} />
              {s.expert.name}
              {s.expert.title && <span className="text-fg-subtle">· {s.expert.title}</span>}
            </span>
            <span className="text-fg-faint">·</span>
            <span className="text-[13px] text-fg-subtle">{fmtDate(s.created_at)}</span>
            <VerifiedBadge status={s.verification.status} score={s.verification.score} />
            {s.consent.signed_by ? (
              <Badge tone="ion" icon={<UserCheck className="size-3" />} title="Motion, gaze and text shared with consent; raw video and face never">
                Consent signed
              </Badge>
            ) : (
              <Badge tone="warn">No consent yet</Badge>
            )}
            {s.status !== 'ready' && (
              <Badge tone={s.status === 'failed' ? 'fault' : 'ion'} dot pulse={s.status === 'processing'}>
                {s.status}
              </Badge>
            )}
          </>
        }
        actions={
          <>
            <ButtonLink to={`/learn/${s.id}`} variant="secondary" icon={<GraduationCap className="size-4" />} data-testid="action-teach">
              Teach
            </ButtonLink>
            <ButtonLink to={`/robot/${s.id}`} variant="secondary" icon={<Bot className="size-4" />} data-testid="action-robot">
              Robot Lab
            </ButtonLink>
            {s.listing_id ? (
              <ButtonLink to={`/exchange/${s.listing_id}`} variant="secondary" icon={<Store className="size-4" />}>
                View listing
              </ButtonLink>
            ) : (
              <ButtonLink
                to={canList ? `/exchange/sell/${s.id}` : '#'}
                onClick={(e) => !canList && e.preventDefault()}
                aria-disabled={!canList}
                title={canList ? undefined : 'Only ready, verified skills can be listed'}
                variant="primary"
                icon={<Store className="size-4" />}
                className={canList ? undefined : 'pointer-events-none opacity-45'}
                data-testid="action-list"
              >
                List on Exchange
              </ButtonLink>
            )}
          </>
        }
      />

      {s.status === 'processing' ? (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
          <ProcessingPanel job={job} />
          <Panel title="What happens next">
            <p className="text-[13px] leading-relaxed text-fg-muted">
              The box is turning the capture into a skill: tracking every frame, finding the steps, writing the lesson, the SOP and the robot program, checking the recording is real, building the 3D twin and recording narration. This page fills in when it finishes.
            </p>
          </Panel>
        </div>
      ) : s.status === 'failed' ? (
        <Panel>
          <EmptyState title="Processing failed">{job?.error ?? 'The pipeline did not finish. Try processing it again from the Studio.'}</EmptyState>
        </Panel>
      ) : (
        <>
          <Tabs<Tab>
            label="Skill sections"
            value={tab}
            onChange={setTab}
            className="mb-5"
            items={[
              { key: 'overview', label: 'Overview', icon: <LayoutList className="size-4" /> },
              { key: 'twin', label: 'Twin', icon: <BoxIcon className="size-4" /> },
              { key: 'sop', label: 'SOP', icon: <FileText className="size-4" /> },
              { key: 'verify', label: 'Verify', icon: <ShieldCheck className="size-4" /> },
              { key: 'answer', label: 'Answer questions', icon: <MessageCircleQuestion className="size-4" />, count: pending },
              { key: 'audit', label: 'Audit a run', icon: <ClipboardCheck className="size-4" /> },
            ]}
          />
          <div role="tabpanel" aria-label={tab}>
            {tab === 'overview' && <OverviewTab skill={s} tracks={tracks.data} pb={pb} />}
            {tab === 'twin' && <TwinTab skill={s} twin={twin.data} tracks={tracks.data} pb={pb} loading={twin.isLoading} />}
            {tab === 'sop' && <SopTab skill={s} />}
            {tab === 'verify' && <VerifyTab skill={s} />}
            {tab === 'answer' && <AnswerTab skill={s} />}
            {tab === 'audit' && <AuditTab skill={s} />}
          </div>
        </>
      )}
      {!ready && s.status !== 'processing' && s.status !== 'failed' && (
        <p className="mt-4 text-sm text-fg-subtle">
          This skill is a draft. <Link to="/studio" className="text-ion hover:underline" onClick={() => navigate('/studio')}>Process it in the Studio</Link>.
        </p>
      )}
    </Page>
  )
}
