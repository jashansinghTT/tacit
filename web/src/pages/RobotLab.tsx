import { useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { Page, PageHeader } from '@/components/layout/Page'
import { Button } from '@/components/ui'
import { useSimScene } from '@/lib/api/robot'
import { SimViewer, type ViewerLayers } from '@/features/robot/SimViewer'
import { emptyPose, startRun, useRunUi } from '@/features/robot/runStream'

export default function RobotLabPage() {
  const { skillId } = useParams()
  const scene = useSimScene(skillId)
  const pose = useRef(emptyPose())
  const [layers] = useState<ViewerLayers>({ labels: true, trail: true, ghost: true, cameras: true, spawn: true })
  const ui = useRunUi()
  return (
    <Page testId="page-robotlab" wide>
      <PageHeader title="Robot Lab" />
      <div className="flex gap-2">
        {(['scripted', 'policy', 'gr00t', 'replay'] as const).map((m) => (
          <Button key={m} onClick={() => void startRun(skillId!, m, 3).catch(() => undefined)}>
            {m}
          </Button>
        ))}
        <span className="telemetry text-xs text-fg-muted">
          {ui.status} {ui.phase} {ui.error} {ui.done ? JSON.stringify(ui.done) : ''}
        </span>
      </div>
      {scene.data && <SimViewer scene={scene.data} pose={pose} layers={layers} view="overview" className="mt-4 h-[640px]" />}
    </Page>
  )
}
