import { useState } from 'react'
import type { Detection, EggCategory, ProductionLine } from '@/types'
import { DEFECT_TYPES, REVIEW_CONFIDENCE_CUT, categoryColor, fmt } from '@/lib/metrics'
import { FAMILY_LABEL, familyCategory, familyConfidence, familyLineName, type LineFamily } from '@/lib/lineFamily'
import { useDashboardMetrics } from '@/hooks/useDashboardMetrics'
import { CalendarPicker } from '@/components/CalendarPicker'
import { ColumnFilterMenu } from '@/components/ColumnFilterMenu'
import { DetectionDetailDialog } from '@/components/DetectionDetailDialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { cn } from '@/lib/utils'

const PER_PAGE = 8

const ALL_TYPES = 'all'
const TYPE_FILTER_OPTIONS = [
  { value: ALL_TYPES, label: '전체' },
  ...DEFECT_TYPES.map((t) => ({ value: t.label, label: t.label })),
]

interface ReviewProps {
  lines: ProductionLine[]
  detections: Detection[]
  live: boolean
  tick: number
  onOpenTrace: (shellCode: string) => void
}

export function Review({ lines, detections, tick, onOpenTrace }: ReviewProps) {
  const [family, setFamily] = useState<LineFamily>('mono')
  // 검토 대기열의 실제 필터는 이 컬럼 필터 하나뿐 — 상단 "오늘 누적 이상 유형
  // 비중" 카드는 순수 통계 표시용이라 여기에 영향을 주지 않는다.
  const [typeFilter, setTypeFilter] = useState<string>(ALL_TYPES)
  const [page, setPage] = useState(0)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const { typeTotals, totalAbnormal } = useDashboardMetrics(lines)

  // 검토 대기열: 선택된 family(MONO/COLOR) 모델의 판정 기준으로 이상 계란을
  // 뽑고, 판정도가 낮은(불확실한) 순으로 정렬 — 사람 확인이 가장 급한 건이
  // 맨 위로 오도록.
  const allAbnormal = detections.filter((d) => familyCategory(d, family) !== '정상')
  const filtered = allAbnormal
    .filter((d) => typeFilter === ALL_TYPES || familyCategory(d, family) === typeFilter)
    .sort((a, b) => familyConfidence(a, family) - familyConfidence(b, family))

  const pageCount = Math.max(1, Math.ceil(filtered.length / PER_PAGE))
  const clampedPage = Math.min(page, pageCount - 1)
  const pageRows = filtered.slice(clampedPage * PER_PAGE, clampedPage * PER_PAGE + PER_PAGE)

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="flex h-15 flex-none items-center gap-3.5 border-b border-border px-6.5">
        <h1 className="text-[17px] font-semibold">이상 계란 검토</h1>
        <div className="flex-1" />
        <CalendarPicker tick={tick} />
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto p-6.5 [scrollbar-gutter:stable]">
        <div>
          <div className="mb-2.25 text-[13px] text-muted-foreground">오늘 누적 이상 유형 비중</div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <TypeChip label="전체 이상" count={totalAbnormal} share="오늘 누적" />
            {typeTotals.map((t) => (
              <TypeChip
                key={t.key}
                label={t.label}
                count={t.count}
                share={fmt.pct0(totalAbnormal ? (t.count / totalAbnormal) * 100 : 0)}
                color={categoryColor(t.label as EggCategory)}
              />
            ))}
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <div className="text-[15px] font-semibold">검토 대기열</div>
          {/* MONO/COLOR 전환만 하는 컨트롤이라 TabsContent 없이 TabsList만 쓴다
              — 두 뷰의 본문은 아래 같은 테이블 하나를 공유한다. */}
          <Tabs
            value={family}
            onValueChange={(v) => {
              if (!v) return
              setFamily(v as LineFamily)
              setPage(0)
            }}
          >
            <TabsList>
              <TabsTrigger value="mono" className="px-3 text-xs font-semibold">
                {FAMILY_LABEL.mono}
              </TabsTrigger>
              <TabsTrigger value="color" className="px-3 text-xs font-semibold">
                {FAMILY_LABEL.color}
              </TabsTrigger>
            </TabsList>
          </Tabs>
          <span className="ml-auto text-[13px] text-muted-foreground">{fmt.int(filtered.length)}건 · 판정도 낮은 순</span>
        </div>

        <Card className="gap-0 overflow-hidden py-0">
          <div className="overflow-x-auto">
            <Table className="table-fixed">
              <TableHeader>
                <TableRow className="bg-muted/60 hover:bg-muted/60">
                  <TableHead className="w-32 pl-4.5 text-xs font-semibold text-muted-foreground">
                    <div className="flex items-center gap-1">
                      유형
                      <ColumnFilterMenu
                        ariaLabel="유형 필터"
                        options={TYPE_FILTER_OPTIONS}
                        value={typeFilter}
                        neutralValue={ALL_TYPES}
                        onChange={(v) => {
                          setTypeFilter(v)
                          setPage(0)
                        }}
                      />
                    </div>
                  </TableHead>
                  <TableHead className="w-24 text-xs font-semibold text-muted-foreground">라인</TableHead>
                  <TableHead className="w-22 text-xs font-semibold text-muted-foreground">시간</TableHead>
                  <TableHead className="w-28 pr-4.5 text-xs font-semibold text-muted-foreground">판정도</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pageRows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="py-12 text-center text-[13px] text-muted-foreground">
                      조건에 맞는 이상 계란이 없습니다
                    </TableCell>
                  </TableRow>
                ) : (
                  pageRows.map((d) => {
                    const cat = familyCategory(d, family)
                    const conf = familyConfidence(d, family)
                    const low = conf < REVIEW_CONFIDENCE_CUT
                    return (
                      <TableRow key={d.id} className="cursor-pointer" onClick={() => setSelectedId(d.id)}>
                        <TableCell className="pl-4.5">
                          <Badge style={{ background: categoryColor(cat) }} className="font-semibold text-white">
                            {cat}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm">{familyLineName(lines, d.line)}</TableCell>
                        <TableCell className="font-mono text-xs text-muted-foreground">{d.time}</TableCell>
                        <TableCell className="pr-4.5">
                          <span className="flex items-center gap-1.5 font-mono text-sm font-semibold">
                            {conf.toFixed(2)}
                            {low && <span className="size-1.75 rounded-full bg-cj-orange" title="판정도 낮음" />}
                          </span>
                        </TableCell>
                      </TableRow>
                    )
                  })
                )}
              </TableBody>
            </Table>
          </div>

          <div className="flex items-center justify-between border-t border-border px-4.5 py-2.75 text-[13px] text-muted-foreground">
            <span>
              {filtered.length === 0
                ? '0건'
                : `${clampedPage * PER_PAGE + 1}–${Math.min(filtered.length, clampedPage * PER_PAGE + PER_PAGE)} / ${filtered.length}건 · 판정도 낮은 순`}
            </span>
            <div className="flex gap-2">
              <Button type="button" variant="outline" size="sm" disabled={clampedPage === 0} onClick={() => setPage((p) => Math.max(0, p - 1))}>
                이전
              </Button>
              <Button type="button" variant="outline" size="sm" disabled={clampedPage >= pageCount - 1} onClick={() => setPage((p) => p + 1)}>
                다음
              </Button>
            </div>
          </div>
        </Card>
      </div>

      <DetectionDetailDialog detections={filtered} lines={lines} selectedId={selectedId} onSelect={setSelectedId} onOpenTrace={onOpenTrace} />
    </div>
  )
}

function TypeChip({ label, count, share, color }: { label: string; count: number; share: string; color?: string }) {
  return (
    <div className={cn('flex flex-col items-start gap-0.5 rounded-[14px] border border-border bg-card px-4 py-3.25 text-left')}>
      <span className="text-[13px] text-muted-foreground">{label}</span>
      <span className="font-mono text-[22px] font-bold" style={color ? { color } : undefined}>
        {fmt.int(count)}
      </span>
      <span className="text-xs text-muted-foreground">{share}</span>
    </div>
  )
}
