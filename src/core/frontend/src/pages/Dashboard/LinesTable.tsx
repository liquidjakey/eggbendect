import { useState } from 'react'
import type { Detection, ProductionLine } from '@/types'
import { ALERT_RATE_THRESHOLD, DEFECT_TYPES, familyLineBreakdown, fmt } from '@/lib/metrics'
import type { LineFamily } from '@/lib/lineFamily'
import { ColumnFilterMenu } from '@/components/ColumnFilterMenu'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { cn } from '@/lib/utils'

interface LinesTableProps {
  lines: ProductionLine[]
  detections: Detection[]
  onOpenLine: (key: string) => void
}

export function LinesTable({ lines, detections, onOpenLine }: LinesTableProps) {
  // '라인' 컬럼의 리스트 필터가 정렬 대신 이 표시 모드를 고른다 — MONO/COLOR
  // 중 어느 모델 판정으로 라인명·이상률·유형 컬럼을 보여줄지.
  const [family, setFamily] = useState<LineFamily>('mono')
  const rows = familyLineBreakdown(lines, detections, family)

  return (
    <section>
      <div className="mb-3 flex items-center gap-2.5">
        <div className="text-[15px] font-semibold">생산 라인</div>
      </div>

      <Card className="overflow-x-auto py-0">
        {/* table-fixed + explicit column widths so the grid doesn't reflow
            when a status badge/warning appears — every row lays out on the
            same grid regardless of its content. */}
        <Table className="min-w-max table-fixed">
          <TableHeader>
            <TableRow className="bg-muted/60 hover:bg-muted/60">
              <TableHead className="w-35 py-2.5 pr-3 pl-4.5 text-xs font-semibold text-muted-foreground">
                <div className="flex items-center gap-1">
                  라인
                  <ColumnFilterMenu
                    ariaLabel="라인 필터"
                    options={[
                      { value: 'mono', label: 'MONO' },
                      { value: 'color', label: 'COLOR' },
                    ]}
                    value={family}
                    onChange={(v) => setFamily(v as LineFamily)}
                  />
                </div>
              </TableHead>
              <TableHead className="w-56 px-3 text-xs font-semibold text-muted-foreground">상태</TableHead>
              <TableHead className="w-24 px-3 text-xs font-semibold text-muted-foreground">검사량 (건)</TableHead>
              <TableHead className="w-20 px-3 text-xs font-semibold text-muted-foreground">이상률</TableHead>
              {DEFECT_TYPES.map((t, i) => (
                <TableHead
                  key={t.key}
                  className={cn('w-16 px-3 text-xs font-semibold text-muted-foreground', i === DEFECT_TYPES.length - 1 && 'pr-4.5')}
                >
                  {t.label}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => {
              const line = lines.find((l) => l.key === r.key)
              const over = r.rate > ALERT_RATE_THRESHOLD
              const stop = line?.status === 'stop'
              const warn = line?.health === 'lens'

              return (
                <TableRow
                  key={r.key}
                  className="cursor-pointer"
                  onClick={() => onOpenLine(r.key)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') onOpenLine(r.key)
                  }}
                  aria-label={`${r.name} · ${stop ? '정지' : '가동 중'} · 이상률 ${fmt.pct1(r.rate)} · 미리보기 열기`}
                >
                  <TableCell className="py-3.5 pr-3 pl-4.5 text-sm font-semibold whitespace-normal">{r.name}</TableCell>
                  <TableCell className="px-3 whitespace-normal">
                    <div className="flex items-center gap-1.75">
                      <span className={cn('size-2 flex-none rounded-full', stop ? 'rounded-sm bg-cj-red' : 'bg-cj-blue')} />
                      <span className={cn('truncate text-[13px]', stop ? 'font-semibold text-[#8e0b11]' : 'text-muted-foreground')}>
                        {stop ? (line?.stopNote ?? '정지') : '가동 중'}
                      </span>
                      {over && <Badge className="bg-cj-red-tint font-semibold text-cj-red">기준 초과</Badge>}
                      {warn && <Badge className="bg-cj-orange-tint font-semibold text-[#b4610a]">렌즈 점검</Badge>}
                    </div>
                  </TableCell>
                  <TableCell className="px-3 font-mono text-sm font-semibold">{fmt.int(r.count)}</TableCell>
                  <TableCell className={cn('px-3 font-mono text-sm font-bold', over && 'text-cj-red')}>{fmt.pct1(r.rate)}</TableCell>
                  <TableCell className="px-3 font-mono text-[13px] text-muted-foreground">{fmt.int(r.t.fm)}</TableCell>
                  <TableCell className="px-3 font-mono text-[13px] text-muted-foreground">{fmt.int(r.t.disc)}</TableCell>
                  <TableCell className="px-3 font-mono text-[13px] text-muted-foreground">{fmt.int(r.t.blood)}</TableCell>
                  <TableCell className="px-3 font-mono text-[13px] text-muted-foreground">{fmt.int(r.t.crack)}</TableCell>
                  <TableCell className="pr-4.5 pl-3 font-mono text-[13px] text-muted-foreground">{fmt.int(r.t.def)}</TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </Card>
    </section>
  )
}
