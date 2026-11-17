import { TriangleAlert } from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'

interface AlertBannerProps {
  text: string
  sub: string
  onOpenLine: () => void
  onDismiss: () => void
}

export function AlertBanner({ text, sub, onOpenLine, onDismiss }: AlertBannerProps) {
  return (
    <Alert
      variant="destructive"
      className="flex flex-none items-center gap-3 rounded-none border-x-0 border-t-0 bg-cj-red-tint px-6.5 py-2.75"
    >
      <TriangleAlert className="translate-y-0! flex-none text-cj-red" />
      <div className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-2">
        <AlertTitle className="text-[13px] font-semibold text-[#8e0b11]">{text}</AlertTitle>
        <AlertDescription className="text-[13px] text-[#8e0b11]/80">{sub}</AlertDescription>
      </div>
      <div className="ml-auto flex flex-none gap-2">
        <Button
          type="button"
          size="sm"
          className="bg-cj-red font-semibold text-white hover:bg-cj-red/90"
          onClick={onOpenLine}
        >
          해당 라인 열기
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="border-[#f0aeb2] bg-transparent font-semibold text-[#8e0b11] hover:bg-[#f0aeb2]/20"
          onClick={onDismiss}
        >
          오늘 하루 숨기기
        </Button>
      </div>
    </Alert>
  )
}
