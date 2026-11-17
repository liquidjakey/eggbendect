import { useState } from 'react'
import type { Detection, ProductionLine } from '@/types'
import type { LineFamily } from '@/lib/lineFamily'
import { LiveIndicator } from '@/components/LiveIndicator'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { LineView } from './LineView'
import { EggList } from './EggList'

export type MonitorTab = 'line' | 'eggs'

interface MonitorProps {
  lines: ProductionLine[]
  detections: Detection[]
  live: boolean
  tick: number
  /** Jump straight to a specific line's live view (e.g. from the alert banner). */
  focusLineKey?: string
  /** Jump straight to a tab (e.g. "검사 계란 목록" from the trace screen). */
  focusTab?: MonitorTab
  onOpenTrace: (shellCode: string) => void
}

export function Monitor({ lines, detections, live, tick, focusLineKey, focusTab, onOpenTrace }: MonitorProps) {
  const [tab, setTab] = useState<MonitorTab>(focusTab ?? 'line')
  const [lineKey, setLineKey] = useState(focusLineKey ?? lines[0]?.key ?? '')
  // "라인 화면"과 "검사 계란 목록" 두 탭이 같은 MONO/COLOR 선택을 공유한다.
  const [family, setFamily] = useState<LineFamily>('mono')

  // "Adjust state during render" (not an effect) so a fresh `focusLineKey` /
  // `focusTab` request — e.g. from the alert banner or the trace screen —
  // jumps the view over immediately, in the same render pass, rather than
  // flashing the previous view first.
  const [seenFocusLineKey, setSeenFocusLineKey] = useState(focusLineKey)
  if (focusLineKey && focusLineKey !== seenFocusLineKey) {
    setSeenFocusLineKey(focusLineKey)
    setLineKey(focusLineKey)
    setTab('line')
  }
  const [seenFocusTab, setSeenFocusTab] = useState(focusTab)
  if (focusTab && focusTab !== seenFocusTab) {
    setSeenFocusTab(focusTab)
    setTab(focusTab)
  }

  const activeLine = lines.find((l) => l.key === lineKey) ?? lines[0]

  return (
    <Tabs value={tab} onValueChange={(v) => setTab(v as MonitorTab)} className="flex min-h-0 flex-1 flex-col gap-0 overflow-hidden">
      <div className="flex h-15 flex-none items-center gap-3 border-b border-border px-6.5">
        <h1 className="text-[17px] font-semibold">생산라인 모니터링</h1>
        <TabsList>
          <TabsTrigger value="line" className="px-3 text-xs font-semibold">
            라인 화면
          </TabsTrigger>
          <TabsTrigger value="eggs" className="px-3 text-xs font-semibold">
            검사 계란 목록
          </TabsTrigger>
        </TabsList>
        <div className="flex-1" />
        <LiveIndicator live={live} tick={tick} />
      </div>

      {/* TabsContent renders as a plain block box by default — without an
          explicit `flex` display here, it can't hand a real height down to
          LineView's `flex-1` children, so each panel silently fell back to
          sizing itself from its own content (a longer detection feed made a
          taller box) instead of the viewport. */}
      <TabsContent value="line" className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {activeLine && (
          <LineView
            lines={lines}
            activeLine={activeLine}
            onSelectLine={setLineKey}
            family={family}
            onSelectFamily={setFamily}
            detections={detections}
            live={live}
            onOpenTrace={onOpenTrace}
          />
        )}
      </TabsContent>
      <TabsContent value="eggs" className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <EggList lines={lines} detections={detections} family={family} onSelectFamily={setFamily} onOpenTrace={onOpenTrace} />
      </TabsContent>
    </Tabs>
  )
}
