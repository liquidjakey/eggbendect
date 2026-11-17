import { useMemo, useState } from 'react'
import type { Detection, ProductionLine } from '@/types'
import { REVIEW_CONFIDENCE_CUT, categoryColor, fmt } from '@/lib/metrics'
import { formatShellCode } from '@/lib/shellCode'
import { familyCategory, familyConfidence, familyLineName, type LineFamily } from '@/lib/lineFamily'
import { EggDetailPanel } from '@/components/EggDetailPanel'
import { ComboboxSelect, type ComboboxOptionGroup } from '@/components/ComboboxSelect'
import { useLineFamilyGroups } from '@/hooks/useLineFamilyGroups'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { cn } from '@/lib/utils'

type StatusFilter = 'all' | 'normal' | 'abn'

const PER_PAGE = 12

interface EggListProps {
  lines: ProductionLine[]
  detections: Detection[]
  family: LineFamily
  onSelectFamily: (family: LineFamily) => void
  onOpenTrace: (shellCode: string) => void
}

export function EggList({ lines, detections, family, onSelectFamily, onOpenTrace }: EggListProps) {
  const [scope, setScope] = useState<string>('all')
  const [status, setStatus] = useState<StatusFilter>('all')
  const [page, setPage] = useState(0)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const filtered = useMemo(() => {
    return detections
      .filter((d) => scope === 'all' || d.line === scope)
      .filter((d) => {
        const cat = familyCategory(d, family)
        return status === 'all' ? true : status === 'normal' ? cat === '정상' : cat !== '정상'
      })
      .sort((a, b) => (a.time < b.time ? 1 : -1))
  }, [detections, scope, status, family])

  const pageCount = Math.max(1, Math.ceil(filtered.length / PER_PAGE))
  const clampedPage = Math.min(page, pageCount - 1)
  const pageRows = filtered.slice(clampedPage * PER_PAGE, clampedPage * PER_PAGE + PER_PAGE)
  const selected = filtered.find((d) => d.id === selectedId) ?? pageRows[0] ?? filtered[0] ?? null

  const scopeLabel = scope === 'all' ? '전체 라인' : familyLineName(lines, scope)

  // "전체 라인" sits in its own leading group so it stays reachable regardless
  // of which family the rest of the list is showing.
  const familyGroups = useLineFamilyGroups(lines)
  const scopeOptions: ComboboxOptionGroup[] = useMemo(
    () => [{ label: '전체', items: [{ value: 'all', label: '전체 라인' }] }, ...familyGroups],
    [familyGroups],
  )

  return (
    <div className="flex min-h-0 flex-1 overflow-hidden">
      <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-3 overflow-hidden p-4.5">
        <div className="flex flex-none flex-wrap items-center gap-2.5">
          <ComboboxSelect
            options={scopeOptions}
            value={scope === 'all' ? 'all' : `${family}:${scope}`}
            onValueChange={(v) => {
              if (!v) return
              if (v === 'all') {
                setScope('all')
              } else {
                const [fam, key] = v.split(':')
                setScope(key)
                onSelectFamily(fam as LineFamily)
              }
              setPage(0)
            }}
            ariaLabel="라인 선택"
            triggerClassName="h-8 px-2.5"
            contentClassName="min-w-70"
          >
            <span className="text-sm font-semibold">{scopeLabel}</span>
          </ComboboxSelect>

          <ToggleGroup
            type="single"
            variant="outline"
            spacing={0}
            value={status}
            onValueChange={(v) => {
              if (!v) return
              setStatus(v as StatusFilter)
              setPage(0)
            }}
          >
            <ToggleGroupItem value="all" className="px-3 text-xs font-semibold">
              전체
            </ToggleGroupItem>
            <ToggleGroupItem value="normal" className="px-3 text-xs font-semibold">
              정상
            </ToggleGroupItem>
            <ToggleGroupItem value="abn" className="px-3 text-xs font-semibold">
              이상
            </ToggleGroupItem>
          </ToggleGroup>

          <span className="ml-auto text-[13px] text-muted-foreground">{fmt.int(filtered.length)}건</span>
        </div>

        <Card className="min-h-0 flex-1 gap-0 overflow-hidden py-0">
          <div className="min-h-0 flex-1 overflow-x-auto overflow-y-auto">
            {/* table-fixed + explicit column widths: with the default auto
                layout, each page re-measures column widths from whatever
                content happens to be on it, so the grid visibly reflows
                between pages (a longer/shorter 난각번호, a 판정 label with or
                without the low-confidence dot, ...). Fixed widths make every
                page — and every line — lay out identically. */}
            <Table className="table-fixed">
              <TableHeader>
                <TableRow className="bg-muted/60 hover:bg-muted/60">
                  <TableHead className="w-22 pl-4.5 text-xs font-semibold text-muted-foreground">시간</TableHead>
                  <TableHead className="w-24 text-xs font-semibold text-muted-foreground">라인</TableHead>
                  <TableHead className="w-36 text-xs font-semibold text-muted-foreground">난각번호</TableHead>
                  <TableHead className="w-28 text-xs font-semibold text-muted-foreground">판정</TableHead>
                  <TableHead className="w-24 pr-4.5 text-xs font-semibold text-muted-foreground">판정도</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pageRows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="py-12 text-center text-[13px] text-muted-foreground">
                      조건에 맞는 계란이 없습니다
                    </TableCell>
                  </TableRow>
                ) : (
                  pageRows.map((d) => {
                    const cat = familyCategory(d, family)
                    const conf = familyConfidence(d, family)
                    const isSelected = d.id === selected?.id
                    const low = cat !== '정상' && conf < REVIEW_CONFIDENCE_CUT
                    return (
                      <TableRow
                        key={d.id}
                        className={cn('cursor-pointer', isSelected && 'bg-cj-blue-tint hover:bg-cj-blue-tint')}
                        onClick={() => setSelectedId(d.id)}
                        aria-selected={isSelected}
                      >
                        <TableCell className="pl-4.5 font-mono text-xs text-muted-foreground">{d.time}</TableCell>
                        <TableCell className="text-sm">{familyLineName(lines, d.line)}</TableCell>
                        <TableCell className="font-mono text-xs tracking-wide text-muted-foreground">{formatShellCode(d.farm)}</TableCell>
                        <TableCell>
                          <span className="flex items-center gap-1.75 text-sm font-semibold" style={{ color: categoryColor(cat) }}>
                            <span className="size-2 flex-none rounded-full" style={{ background: categoryColor(cat) }} />
                            {cat}
                          </span>
                        </TableCell>
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

          <div className="flex flex-none items-center justify-between border-t border-border px-4.5 py-2.75 text-[13px] text-muted-foreground">
            <span>
              {filtered.length === 0
                ? '0건'
                : `${clampedPage * PER_PAGE + 1}–${Math.min(filtered.length, clampedPage * PER_PAGE + PER_PAGE)} / ${filtered.length}건`}
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

      <div className="w-88 flex-none space-y-4 overflow-y-auto border-l border-border p-4.5">
        {!selected ? (
          <div className="pt-10 text-center text-[13px] text-muted-foreground">선택된 계란이 없습니다</div>
        ) : (
          <EggDetailPanel detection={selected} lines={lines} onOpenTrace={onOpenTrace} />
        )}
      </div>
    </div>
  )
}
