import type { Detection, ProductionLine } from '@/types'
import { abnormalRate, fmt, isOverThreshold } from '@/lib/metrics'
import { ConveyorLanes } from '@/components/ConveyorLanes'
import { LinePicker } from '@/components/LinePicker'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'

interface LinePreviewModalProps {
  line: ProductionLine
  lines: ProductionLine[]
  detections: Detection[]
  live: boolean
  onSelectLine: (key: string) => void
  onOpenMonitor: () => void
  onClose: () => void
}

export function LinePreviewModal({ line, lines, detections, live, onSelectLine, onOpenMonitor, onClose }: LinePreviewModalProps) {
  const stopped = line.status === 'stop'
  const over = isOverThreshold(line)

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="flex max-h-[calc(100vh-4rem)] flex-col gap-0 p-0 sm:max-w-165" showCloseButton={false}>
        <DialogHeader className="flex-row items-center gap-2.5 border-b border-border px-5 py-3.5">
          <span
            className={cn(
              'size-2.5 flex-none rounded-full',
              stopped ? 'rounded-sm bg-cj-red' : over ? 'bg-cj-red' : 'bg-cj-blue',
            )}
          />

          <DialogTitle className="sr-only">{line.name} 실시간 미리보기</DialogTitle>

          <LinePicker
            lines={lines}
            activeKey={line.key}
            activeFamily="mono"
            onSelect={(key) => onSelectLine(key)}
            triggerVariant="ghost"
            triggerClassName="h-8 gap-1.5 px-2 pl-0.5"
          >
            <span className="text-[17px] font-bold">{line.name}</span>
          </LinePicker>

          <Badge variant={stopped ? 'secondary' : 'default'} className={cn('font-semibold', !stopped && 'bg-cj-blue-tint text-cj-blue-d')}>
            {stopped ? '정지' : '가동 중'}
          </Badge>
          <span className="text-[13px] text-muted-foreground">
            이상률 <span className={cn('font-mono', over ? 'font-bold text-cj-red' : 'font-semibold text-foreground')}>{fmt.pct1(abnormalRate(line))}</span>
          </span>
        </DialogHeader>

        <div className="flex min-h-0 flex-1 overflow-y-auto p-5">
          <ConveyorLanes line={line} detections={detections} live={live} family={null} />
        </div>

        <DialogFooter className="mx-0 mb-0 flex-row justify-end gap-2.5 rounded-none border-t border-border bg-transparent px-5 py-3.5">
          <Button type="button" variant="outline" className="font-semibold" onClick={onClose}>
            닫기
          </Button>
          <Button type="button" className="bg-cj-blue font-semibold text-white hover:bg-cj-blue/90" onClick={onOpenMonitor}>
            생산라인 모니터링 열기
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
