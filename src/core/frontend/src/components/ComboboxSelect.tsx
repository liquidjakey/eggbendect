import { useMemo, type ReactNode } from 'react'
import {
  Combobox,
  ComboboxCollection,
  ComboboxContent,
  ComboboxGroup,
  ComboboxInput,
  ComboboxItem,
  ComboboxLabel,
  ComboboxList,
  ComboboxTrigger,
} from '@/components/ui/combobox'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export interface ComboboxOption {
  value: string
  label: string
  /** Trailing content on the right of the row (e.g. a 가동 중/정지 status). */
  meta?: ReactNode
}

export interface ComboboxOptionGroup {
  label: string
  items: ComboboxOption[]
}

function isGrouped(options: ComboboxOption[] | ComboboxOptionGroup[]): options is ComboboxOptionGroup[] {
  return options.length > 0 && 'items' in options[0]
}

interface ComboboxSelectProps {
  options: ComboboxOption[] | ComboboxOptionGroup[]
  value: string
  onValueChange: (value: string) => void
  /** Trigger button content — the chevron is appended automatically. */
  children: ReactNode
  ariaLabel: string
  triggerClassName?: string
  triggerVariant?: 'outline' | 'ghost'
  contentClassName?: string
  /** Highlights the trigger (e.g. a column filter that's actively narrowing rows). */
  active?: boolean
}

/** Select-style dropdown: a button trigger showing the current selection, opening
 *  a popup listing the (optionally grouped) options with a check indicator on the
 *  selected row. Shared by every list dropdown in the app — line pickers, scope
 *  pickers, and table column filters — so they all read and behave identically.
 *
 *  Deliberately has no search field: every list here is short enough to pick from
 *  directly, and a search box on a 2–6 item list is noise. */
export function ComboboxSelect({
  options,
  value,
  onValueChange,
  children,
  ariaLabel,
  triggerClassName,
  triggerVariant = 'outline',
  contentClassName,
  active,
}: ComboboxSelectProps) {
  const grouped = isGrouped(options)
  // Base UI resolves selection by item identity, so the option handed to
  // `value` must be the very object in `items` — flatten once and look up
  // from that list rather than rebuilding an equivalent object.
  const flat = useMemo(
    () => (isGrouped(options) ? options.flatMap((g) => g.items) : options),
    [options],
  )
  const selected = flat.find((o) => o.value === value) ?? null

  const renderItem = (item: ComboboxOption) => (
    <ComboboxItem key={item.value} value={item}>
      <span className="truncate text-sm font-semibold">{item.label}</span>
      {item.meta && <span className="ml-auto pl-2">{item.meta}</span>}
    </ComboboxItem>
  )

  return (
    <Combobox
      items={options}
      value={selected}
      onValueChange={(next: unknown) => onValueChange((next as ComboboxOption | null)?.value ?? '')}
      itemToStringLabel={(item: ComboboxOption) => item.label}
    >
      <ComboboxTrigger
        aria-label={ariaLabel}
        render={
          <Button
            type="button"
            variant={triggerVariant}
            className={cn(
              'justify-between gap-1.5 rounded-[10px]',
              active && 'border-cj-blue bg-cj-blue-tint text-cj-blue-d',
              triggerClassName,
            )}
          />
        }
      >
        {children}
      </ComboboxTrigger>

      <ComboboxContent className={cn('min-w-44', contentClassName)}>
        {/* Base UI's single-select combobox resets/bypasses its internal
            query only when a real <Combobox.Input> is mounted inside the
            popup — with none rendered at all, the query from the previous
            selection leaks into the next open and the list filters down to
            (usually) just one stale match. This list is always short enough
            that a visible search box would be noise, so the input stays
            mounted purely for that bookkeeping and is hidden from view.
            `sr-only` alone isn't enough here: ComboboxContent styles any
            `[data-slot=input-group]` descendant with `*:data-[slot=input-
            group]:h-8`/`m-1` etc., and that descendant-selector rule beats
            sr-only's plain class, leaving a visible ~32px blank box (the
            reported "gap" above every list). `!` (important) utilities are
            required to actually win over it. */}
        <ComboboxInput
          showTrigger={false}
          tabIndex={-1}
          className="!absolute !m-0 !h-px !w-px !overflow-hidden !border-0 !p-0 opacity-0"
        />
        <ComboboxList>
          {grouped
            ? (group: ComboboxOptionGroup) => (
                <ComboboxGroup key={group.label} items={group.items}>
                  <ComboboxLabel>{group.label}</ComboboxLabel>
                  <ComboboxCollection>{renderItem}</ComboboxCollection>
                </ComboboxGroup>
              )
            : renderItem}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  )
}
