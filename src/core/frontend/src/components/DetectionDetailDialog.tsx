import type { Detection, ProductionLine } from '@/types'
import { EggDetailPanel } from '@/components/EggDetailPanel'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'

interface DetectionDetailDialogProps {
  /** The list `selectedId` is looked up in — also what "다음 건" cycles
   *  through, so callers should pass whatever's currently on screen
   *  (a filtered/sorted queue, a single line's detections, ...). */
  detections: Detection[]
  lines: ProductionLine[]
  selectedId: string | null
  onSelect: (id: string | null) => void
  onOpenTrace: (shellCode: string) => void
}

/** Selection lookup + "다음 건" wraparound + the Dialog/EggDetailPanel
 *  wiring shared by every detection queue (Review's 검토 대기열, Monitor's
 *  라인별 보기 검출 대기열, EggList's row selection) — kept in one place so a
 *  fix to this flow can't drift between screens. */
export function DetectionDetailDialog({ detections, lines, selectedId, onSelect, onOpenTrace }: DetectionDetailDialogProps) {
  const selectedIdx = detections.findIndex((d) => d.id === selectedId)
  const selected = selectedIdx >= 0 ? detections[selectedIdx] : null
  const goNext = () => {
    if (selectedIdx < 0) return
    const next = detections[(selectedIdx + 1) % detections.length]
    onSelect(next.id)
  }

  return (
    <Dialog open={!!selected} onOpenChange={(open) => !open && onSelect(null)}>
      <DialogContent className="flex max-h-[calc(100vh-4rem)] flex-col gap-4 overflow-y-auto sm:max-w-100" showCloseButton>
        <DialogTitle className="sr-only">{selected ? `${selected.id} 상세` : '이상 계란 상세'}</DialogTitle>
        {selected && (
          <EggDetailPanel detection={selected} lines={lines} onOpenTrace={onOpenTrace} onNext={goNext} />
        )}
      </DialogContent>
    </Dialog>
  )
}
