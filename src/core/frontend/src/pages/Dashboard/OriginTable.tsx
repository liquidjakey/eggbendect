import { useState } from 'react'
import type { OriginStat } from '@/lib/api'
import { ALERT_RATE_THRESHOLD, fmt } from '@/lib/metrics'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { cn } from '@/lib/utils'

const PER_PAGE = 8

interface OriginTableProps {
  origins: OriginStat[]
}

/** 농장(원산지)별 이상 계란률 - 백엔드가 이미 이상률 높은 순으로 정렬해서 내려준다.
 *  농장 수가 많아질 수 있어 "이상 계란 검토" 페이지와 동일한 방식으로 페이지네이션한다. */
export function OriginTable({ origins }: OriginTableProps) {
  const [page, setPage] = useState(0)

  const pageCount = Math.max(1, Math.ceil(origins.length / PER_PAGE))
  const clampedPage = Math.min(page, pageCount - 1)
  const pageRows = origins.slice(clampedPage * PER_PAGE, clampedPage * PER_PAGE + PER_PAGE)

  return (
    <section>
      <div className="mb-3 flex items-center gap-2.5">
        <div className="text-[15px] font-semibold">농장별 이상 계란률</div>
      </div>

      <Card className="overflow-x-auto py-0">
        <Table className="min-w-max table-fixed">
          <TableHeader>
            <TableRow className="bg-muted/60 hover:bg-muted/60">
              <TableHead className="w-40 py-2.5 pr-3 pl-4.5 text-xs font-semibold text-muted-foreground">농장식별번호</TableHead>
              <TableHead className="w-40 px-3 text-xs font-semibold text-muted-foreground">농장경영자명</TableHead>
              <TableHead className="w-64 px-3 text-xs font-semibold text-muted-foreground">농장소재지</TableHead>
              <TableHead className="w-28 pr-4.5 pl-3 text-xs font-semibold text-muted-foreground">이상 계란률</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {origins.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="py-6 text-center text-[13px] text-muted-foreground">
                  검사 이력이 있는 농장이 없습니다
                </TableCell>
              </TableRow>
            ) : (
              pageRows.map((o) => {
                const over = o.defectRate > ALERT_RATE_THRESHOLD
                return (
                  <TableRow key={o.originId}>
                    <TableCell className="py-3.5 pr-3 pl-4.5 font-mono text-sm font-semibold whitespace-normal">{o.originId}</TableCell>
                    <TableCell className="px-3 text-sm whitespace-normal">{o.owner ?? '-'}</TableCell>
                    <TableCell className="px-3 text-sm whitespace-normal">{o.location ?? '-'}</TableCell>
                    <TableCell className={cn('pr-4.5 pl-3 font-mono text-sm font-bold', over && 'text-cj-red')}>
                      {fmt.pct1(o.defectRate)}
                    </TableCell>
                  </TableRow>
                )
              })
            )}
          </TableBody>
        </Table>

        <div className="flex items-center justify-between border-t border-border px-4.5 py-2.75 text-[13px] text-muted-foreground">
          <span>
            {origins.length === 0
              ? '0건'
              : `${clampedPage * PER_PAGE + 1}–${Math.min(origins.length, clampedPage * PER_PAGE + PER_PAGE)} / ${origins.length}건`}
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
    </section>
  )
}
