import { useState } from 'react'
import { LayoutGrid, TriangleAlert, ChevronLeft, ChevronRight, LogOut } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { BrandMark, BrandWordmark } from '@/components/BrandMark'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'

export type NavKey = 'dashboard' | 'monitor' | 'review' | 'lots'

interface NavItem {
  key: NavKey
  label: string
  icon: React.ComponentType<{ className?: string }>
}

// Original design's "생산라인 모니터링" mark — a stacked-layers glyph, kept as
// the exact source paths rather than swapped for a similar-but-not-identical
// lucide icon.
function MonitorIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="m12 2 9 5-9 5-9-5 9-5Z" />
      <path d="m3 12 9 5 9-5" />
      <path d="m3 17 9 5 9-5" />
    </svg>
  )
}

// Original design's "난각번호 이력 조회" mark — a pin shape with a crossbar.
function ShellLookupIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2a5 5 0 0 1 5 5c0 3.5-2 6-5 13C9 13 7 10.5 7 7a5 5 0 0 1 5-5Z" />
      <path d="M9.5 8.5h5" />
    </svg>
  )
}

const NAV_ITEMS: NavItem[] = [
  { key: 'dashboard', label: '품질 검사 대시보드', icon: LayoutGrid },
  { key: 'monitor', label: '생산라인 모니터링', icon: MonitorIcon },
  { key: 'review', label: '이상 계란 검토', icon: TriangleAlert },
  { key: 'lots', label: '난각번호 이력 조회', icon: ShellLookupIcon },
]

interface SidebarProps {
  open: boolean
  onToggle: () => void
  active: NavKey
  onNavigate: (key: NavKey) => void
  operatorName: string
  operatorRole: string
  onLogout: () => void
}

export function Sidebar({
  open,
  onToggle,
  active,
  onNavigate,
  operatorName,
  operatorRole,
  onLogout,
}: SidebarProps) {
  const [confirmOpen, setConfirmOpen] = useState(false)

  return (
    <aside
      className={cn(
        'flex flex-none flex-col border-r border-border bg-sidebar p-3 transition-[width] duration-150',
        open ? 'w-65' : 'w-19',
      )}
    >
      <div className={cn('flex items-center gap-2.5 pb-4.5 pt-1.5', open ? 'flex-row' : 'flex-col')}>
        <BrandMark className="size-8.5 flex-none" />
        {open && (
          <div className="min-w-0">
            <BrandWordmark className="leading-tight" textClassName="text-[17px]" />
            <div className="text-[11px] text-muted-foreground">AI 기반 계란 품질검사</div>
          </div>
        )}
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className={cn('flex-none border border-border bg-background', open && 'ml-auto')}
          onClick={onToggle}
          title={open ? '사이드바 접기' : '사이드바 펼치기'}
          aria-label={open ? '사이드바 접기' : '사이드바 펼치기'}
        >
          {open ? <ChevronLeft /> : <ChevronRight />}
        </Button>
      </div>

      <nav className="flex flex-col gap-0.5">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon
          const isActive = active === item.key
          return (
            <Button
              key={item.key}
              type="button"
              variant="ghost"
              className={cn(
                'h-auto justify-start gap-2.5 rounded-lg px-2.75 py-2.25 text-sm font-normal',
                open ? 'justify-start' : 'justify-center px-0',
                isActive && 'bg-cj-blue-tint text-cj-blue-d font-semibold hover:bg-cj-blue-tint',
              )}
              onClick={() => onNavigate(item.key)}
              title={item.label}
              aria-current={isActive ? 'page' : undefined}
            >
              <Icon className="size-4.25 shrink-0" />
              {open && <span className="truncate">{item.label}</span>}
            </Button>
          )
        })}
      </nav>

      <div className="mt-auto border-t border-border pt-3">
        <div className={cn('flex items-end gap-2.5 rounded-[10px] px-1.5 py-1.5', open ? 'justify-start' : 'flex-col justify-center')}>
          <Avatar>
            <AvatarFallback>{operatorName.slice(0, 1)}</AvatarFallback>
          </Avatar>
          {open && (
            <span className="min-w-0 flex-1 text-left leading-tight">
              <span className="block truncate text-[13px] font-semibold">{operatorName}</span>
              <span className="block truncate text-[11px] text-muted-foreground">{operatorRole}</span>
            </span>
          )}
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="flex-none text-muted-foreground hover:text-destructive"
            onClick={() => setConfirmOpen(true)}
            title="로그아웃"
            aria-label="로그아웃"
          >
            <LogOut />
          </Button>
        </div>
      </div>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="sm:max-w-80">
          <DialogHeader>
            <DialogTitle>로그아웃 하시겠습니까?</DialogTitle>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setConfirmOpen(false)}>
              아니오
            </Button>
            <Button
              type="button"
              className="bg-cj-red font-semibold text-white hover:bg-cj-red/90"
              onClick={() => {
                setConfirmOpen(false)
                onLogout()
              }}
            >
              예
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </aside>
  )
}
