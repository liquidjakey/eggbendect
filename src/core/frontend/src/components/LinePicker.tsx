import type { ReactNode } from 'react'
import type { ProductionLine } from '@/types'
import type { LineFamily } from '@/lib/lineFamily'
import { lineFamilyOptionValue, parseLineFamilyOptionValue, useLineFamilyGroups } from '@/hooks/useLineFamilyGroups'
import { ComboboxSelect } from '@/components/ComboboxSelect'

interface LinePickerProps {
  lines: ProductionLine[]
  activeKey: string
  activeFamily: LineFamily
  onSelect: (key: string, family: LineFamily) => void
  /** Trigger button content (the chevron is appended automatically). */
  children: ReactNode
  triggerClassName?: string
  triggerVariant?: 'outline' | 'ghost'
}

/** "라인 선택" picker shared by the monitor line view and the dashboard preview
 *  modal — a searchable combobox grouped by MONO LINE / COLOR LINE. */
export function LinePicker({
  lines,
  activeKey,
  activeFamily,
  onSelect,
  children,
  triggerClassName,
  triggerVariant,
}: LinePickerProps) {
  const groups = useLineFamilyGroups(lines)

  return (
    <ComboboxSelect
      options={groups}
      value={lineFamilyOptionValue(activeFamily, activeKey)}
      onValueChange={(v) => {
        if (!v) return
        const { family, key } = parseLineFamilyOptionValue(v)
        onSelect(key, family)
      }}
      ariaLabel="라인 선택"
      triggerClassName={triggerClassName}
      triggerVariant={triggerVariant}
      contentClassName="min-w-65"
    >
      {children}
    </ComboboxSelect>
  )
}
