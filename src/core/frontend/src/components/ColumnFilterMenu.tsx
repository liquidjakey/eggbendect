import { ComboboxSelect, type ComboboxOption } from '@/components/ComboboxSelect'

interface ColumnFilterMenuProps {
  options: ComboboxOption[]
  value: string
  onChange: (value: string) => void
  ariaLabel: string
  /** The "no filter applied" option (e.g. '전체'). When the selection differs
   *  from it the trigger is highlighted, so an active filter is visible without
   *  opening the menu. Omit for a pure view-mode switch (MONO/COLOR), where no
   *  choice counts as filtered. */
  neutralValue?: string
}

/** Compact filter control for a table/card header, built on the shared
 *  {@link ComboboxSelect} — a real dropdown (current selection + chevron),
 *  not a bare icon, so it reads the same as every other select in the app. */
export function ColumnFilterMenu({ options, value, onChange, ariaLabel, neutralValue }: ColumnFilterMenuProps) {
  const selected = options.find((o) => o.value === value)

  return (
    <ComboboxSelect
      options={options}
      value={value}
      onValueChange={onChange}
      ariaLabel={ariaLabel}
      triggerClassName="h-6 max-w-28 gap-1 px-2 text-xs font-semibold"
      contentClassName="min-w-32"
      active={neutralValue !== undefined && value !== neutralValue}
    >
      <span className="truncate">{selected?.label ?? value}</span>
    </ComboboxSelect>
  )
}
