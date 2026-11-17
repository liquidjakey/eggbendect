import { useState, type FormEvent } from 'react'
import { ChevronLeft, CircleCheck, TriangleAlert } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from './Field'

interface ForgotPasswordFormProps {
  onBack: () => void
}

export function ForgotPasswordForm({ onBack }: ForgotPasswordFormProps) {
  const [id, setId] = useState('')
  const [email, setEmail] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState(false)

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (!id.trim() || !email.trim()) {
      setError('아이디와 이메일을 입력해 주세요')
      return
    }
    // Demo environment — no email is actually sent.
    setSent(true)
  }

  if (sent) {
    return (
      <div className="flex flex-col items-center gap-3 py-3 text-center">
        <div className="flex size-12 items-center justify-center rounded-full bg-cj-blue-tint text-cj-blue-d">
          <CircleCheck className="size-6" />
        </div>
        <div className="text-base font-bold">재설정 링크를 보냈습니다</div>
        <div className="text-[13px] text-balance text-muted-foreground">
          <span className="font-mono font-semibold">{email}</span> 로 비밀번호 재설정 안내를 발송했습니다 (데모 환경 · 실제로 발송되지 않습니다)
        </div>
        <Button type="button" variant="outline" className="mt-1 h-9 font-semibold" onClick={onBack}>
          로그인으로 돌아가기
        </Button>
      </div>
    )
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <button type="button" onClick={onBack} className="-ml-1 flex w-fit items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
        <ChevronLeft className="size-3.5" />
        로그인으로 돌아가기
      </button>

      <div>
        <div className="text-lg font-bold">비밀번호 찾기</div>
        <div className="text-[13px] text-muted-foreground">가입한 아이디와 이메일로 재설정 링크를 보내드립니다</div>
      </div>

      <Label label="아이디" htmlFor="forgot-id">
        <Input
          id="forgot-id"
          value={id}
          onChange={(e) => {
            setId(e.target.value)
            setError(null)
          }}
          placeholder="아이디"
          autoComplete="username"
          className="h-10 rounded-[10px]"
        />
      </Label>

      <Label label="이메일" htmlFor="forgot-email">
        <Input
          id="forgot-email"
          type="email"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value)
            setError(null)
          }}
          placeholder="you@example.com"
          autoComplete="email"
          className="h-10 rounded-[10px]"
        />
      </Label>

      {error && (
        <div className="flex items-center gap-1.5 text-xs font-semibold text-cj-red">
          <TriangleAlert className="size-3.5" />
          {error}
        </div>
      )}

      <Button type="submit" className="h-10.5 rounded-[10px] bg-cj-blue font-semibold text-white hover:bg-cj-blue/90">
        재설정 링크 전송
      </Button>
    </form>
  )
}
