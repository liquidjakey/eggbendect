import type { ReactNode } from 'react'

interface LabelProps {
  label: string
  htmlFor: string
  children: ReactNode
}

/** Small label+control wrapper shared by the login/sign-up/forgot-password forms. */
export function Label({ label, htmlFor, children }: LabelProps) {
  return (
    <div className="flex flex-col gap-1.25">
      <label htmlFor={htmlFor} className="text-[13px] font-semibold text-foreground">
        {label}
      </label>
      {children}
    </div>
  )
}
