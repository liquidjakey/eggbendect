import { useState } from 'react'
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight } from 'lucide-react'
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Button } from '@/components/ui/button'
import { simDate } from '@/hooks/useSimClock'
import { cn } from '@/lib/utils'

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토']

interface CalendarPickerProps {
  tick: number
}

/** Compact calendar-picker for the review page's header — a trigger button
 *  showing today's date, opening a month-grid popover (matching the
 *  original design's calendar widget) with today highlighted. */
export function CalendarPicker({ tick }: CalendarPickerProps) {
  const today = simDate(tick)
  const [open, setOpen] = useState(false)
  const [viewYear, setViewYear] = useState(today.getFullYear())
  const [viewMonth, setViewMonth] = useState(today.getMonth())
  const [selected, setSelected] = useState(today)

  // Re-anchor the browsed month back to "today" whenever the popover reopens.
  const handleOpenChange = (next: boolean) => {
    if (next) {
      setViewYear(today.getFullYear())
      setViewMonth(today.getMonth())
    }
    setOpen(next)
  }

  const goMonth = (delta: number) => {
    const d = new Date(viewYear, viewMonth + delta, 1)
    setViewYear(d.getFullYear())
    setViewMonth(d.getMonth())
  }

  const firstOfMonth = new Date(viewYear, viewMonth, 1)
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate()
  const leadingBlanks = firstOfMonth.getDay()
  const cells: (number | null)[] = [
    ...Array(leadingBlanks).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ]

  const isToday = (day: number) => viewYear === today.getFullYear() && viewMonth === today.getMonth() && day === today.getDate()
  const isSelected = (day: number) => viewYear === selected.getFullYear() && viewMonth === selected.getMonth() && day === selected.getDate()

  const p = (n: number) => String(n).padStart(2, '0')

  return (
    <DropdownMenu open={open} onOpenChange={handleOpenChange}>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="outline"
          className="h-8 gap-1.75 rounded-[10px] px-2.5 font-mono text-xs tabular-nums text-muted-foreground"
        >
          <CalendarIcon className="size-3.5" />
          {selected.getFullYear()}.{p(selected.getMonth() + 1)}.{p(selected.getDate())}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64 p-3">
        <div className="mb-2 flex items-center justify-between">
          <Button type="button" variant="ghost" size="icon-sm" onClick={() => goMonth(-1)} aria-label="이전 달">
            <ChevronLeft className="size-4" />
          </Button>
          <span className="text-sm font-semibold">
            {viewYear}년 {viewMonth + 1}월
          </span>
          <Button type="button" variant="ghost" size="icon-sm" onClick={() => goMonth(1)} aria-label="다음 달">
            <ChevronRight className="size-4" />
          </Button>
        </div>
        <div className="grid grid-cols-7 gap-y-1 text-center">
          {WEEKDAYS.map((w) => (
            <span key={w} className="text-[11px] font-semibold text-muted-foreground">
              {w}
            </span>
          ))}
          {cells.map((day, i) =>
            day === null ? (
              <span key={`blank-${i}`} />
            ) : (
              <button
                key={day}
                type="button"
                onClick={() => {
                  setSelected(new Date(viewYear, viewMonth, day))
                  setOpen(false)
                }}
                className={cn(
                  'mx-auto flex size-7 items-center justify-center rounded-full text-[13px] hover:bg-secondary',
                  isSelected(day) && 'bg-cj-blue font-semibold text-white hover:bg-cj-blue',
                  !isSelected(day) && isToday(day) && 'font-semibold text-cj-blue-d ring-1 ring-cj-blue',
                )}
              >
                {day}
              </button>
            ),
          )}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
