import { useState } from 'react'
import type { Detection, ProductionLine } from '@/types'
import { ALERT_RATE_THRESHOLD, REVIEW_CONFIDENCE_CUT, categoryColor, fmt } from '@/lib/metrics'
import { familyCategory, familyConfidence, familyLineName, type LineFamily } from '@/lib/lineFamily'
import { eggImageFor } from '@/lib/eggImages'
import { ConveyorLanes } from '@/components/ConveyorLanes'
import { DetectionDetailDialog } from '@/components/DetectionDetailDialog'
import { LinePicker } from '@/components/LinePicker'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils'

interface LineViewProps {
  lines: ProductionLine[]
  activeLine: ProductionLine
  onSelectLine: (key: string) => void
  family: LineFamily
  onSelectFamily: (family: LineFamily) => void
  detections: Detection[]
  live: boolean
  onOpenTrace: (shellCode: string) => void
}

export function LineView({ lines, activeLine, onSelectLine, family, onSelectFamily, detections, live, onOpenTrace }: LineViewProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null)

  // 백엔드는 라인별 MONO/COLOR 개별 집계를 주지 않으므로, family별 검사량/이상률은
  // 현재 화면에 있는 detections(최근 윈도우) 기준으로 클라이언트에서 계산한다 —
  // Review 큐와 같은 성격의 근사치.
  const lineDetections = detections.filter((d) => d.line === activeLine.key)
  const abnormal = lineDetections
    .filter((d) => familyCategory(d, family) !== '정상')
    .sort((a, b) => (a.time < b.time ? 1 : -1))
  const rate = lineDetections.length ? (abnormal.length / lineDetections.length) * 100 : 0
  const over = rate > ALERT_RATE_THRESHOLD
  const stopped = activeLine.status === 'stop'

  return (
    <div className="flex min-h-0 flex-1 gap-4 overflow-hidden p-4.5">
      <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-3">
        <LinePicker
          lines={lines}
          activeKey={activeLine.key}
          activeFamily={family}
          onSelect={(key, f) => {
            onSelectLine(key)
            onSelectFamily(f)
          }}
          triggerClassName="h-auto w-fit gap-2 self-start py-1.75 pr-2.5 pl-3"
        >
          <span className={cn('size-2.25 flex-none rounded-full', stopped ? 'rounded-sm bg-cj-red' : over ? 'bg-cj-red' : 'bg-cj-blue')} />
          <span className="text-sm font-semibold">{familyLineName(lines, activeLine.key)}</span>
        </LinePicker>

        <ConveyorLanes line={activeLine} detections={lineDetections} live={live} family={family} />
      </div>

      <div className="flex w-88 flex-none flex-col gap-3">
        <Card className="gap-0 py-0">
          <CardContent className="flex flex-col divide-y divide-border px-4">
            <div className="flex items-baseline justify-between py-2.5">
              <span className="text-[13px] text-muted-foreground">검사량</span>
              <span className="font-mono text-lg font-bold">{fmt.int(lineDetections.length)}</span>
            </div>
            <div className="flex items-baseline justify-between py-2.5">
              <span className="text-[13px] text-muted-foreground">
                이상률 <span className="text-[11px]">(기준 2.0%)</span>
              </span>
              <span className={cn('font-mono text-lg font-bold', over && 'text-cj-red')}>{fmt.pct1(rate)}</span>
            </div>
            <div className="flex items-baseline justify-between py-2.5">
              <span className="text-[13px] text-muted-foreground">이상 검출</span>
              <span className="font-mono text-lg font-bold">{fmt.int(abnormal.length)}</span>
            </div>
          </CardContent>
        </Card>

        <Card className="min-h-0 flex-1 gap-0 overflow-hidden py-0">
          <CardHeader className="flex flex-none flex-row items-center gap-2 border-b border-border px-4 py-3">
            <CardTitle className="text-[13px] font-semibold">검출 대기열</CardTitle>
            <span className="text-xs text-muted-foreground">{stopped ? '라인 정지 중' : `최근 ${abnormal.length}건`}</span>
          </CardHeader>
          <CardContent className="min-h-0 flex-1 space-y-2 overflow-y-auto px-2.5 py-2.5">
            {abnormal.length === 0 ? (
              <div className="px-2 py-8 text-center text-[13px] text-balance text-muted-foreground">
                이 라인의 이상 검출이 없습니다
              </div>
            ) : (
              abnormal.map((d) => {
                const cat = familyCategory(d, family)
                const conf = familyConfidence(d, family)
                const color = categoryColor(cat)
                const low = conf < REVIEW_CONFIDENCE_CUT
                const selected = d.id === selectedId
                return (
                  <button
                    key={d.id}
                    type="button"
                    onClick={() => setSelectedId(d.id)}
                    aria-pressed={selected}
                    className={cn(
                      'flex w-full items-center gap-2.75 rounded-[10px] border p-2.25 text-left',
                      selected ? 'border-cj-blue bg-cj-blue/10' : 'border-border bg-card hover:bg-secondary',
                    )}
                  >
                    <img
                      src={eggImageFor(cat, family)}
                      alt=""
                      className="h-11.5 w-9 flex-none rounded-[50%/62%_62%_38%_38%] border-2 object-contain"
                      style={{ borderColor: color }}
                    />
                    <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <span className="flex items-center gap-1.5">
                        <span className="text-[13px] font-bold" style={{ color }}>
                          {cat}
                        </span>
                        <span className="font-mono text-[11px] text-muted-foreground">{d.time}</span>
                      </span>
                      <span className={cn('text-[11px]', low ? 'font-semibold text-[#b4610a]' : 'text-muted-foreground')}>
                        {low ? `판정도 낮음 · ${conf.toFixed(2)}` : `판정도 ${conf.toFixed(2)}`}
                      </span>
                    </span>
                  </button>
                )
              })
            )}
          </CardContent>
        </Card>
      </div>

      <DetectionDetailDialog
        detections={abnormal}
        lines={lines}
        selectedId={selectedId}
        onSelect={setSelectedId}
        onOpenTrace={onOpenTrace}
      />
    </div>
  )
}
