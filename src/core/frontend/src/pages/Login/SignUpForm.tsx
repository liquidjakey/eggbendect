import { useState, type FormEvent } from 'react'
import { ChevronLeft, CircleCheck, TriangleAlert } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from './Field'

interface SignUpFormProps {
  onBack: () => void
}

export function SignUpForm({ onBack }: SignUpFormProps) {
  const [id, setId] = useState('')
  const [name, setName] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitted, setSubmitted] = useState(false)

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (!id.trim() || !name.trim() || !password.trim()) {
      setError('모든 항목을 입력해 주세요')
      return
    }
    if (password !== confirm) {
      setError('비밀번호가 일치하지 않습니다')
      return
    }
    // Demo environment — no real account is created.
    setSubmitted(true)
  }

  if (submitted) {
    return (
      <div className="flex flex-col items-center gap-3 py-3 text-center">
        <div className="flex size-12 items-center justify-center rounded-full bg-cj-blue-tint text-cj-blue-d">
          <CircleCheck className="size-6" />
        </div>
        <div className="text-base font-bold">가입 신청이 접수됐습니다</div>
        <div className="text-[13px] text-balance text-muted-foreground">
          관리자 승인 후 <span className="font-mono font-semibold">{id}</span> 계정으로 로그인하실 수 있습니다 (데모 환경 · 실제 계정은 생성되지
          않습니다)
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
        <div className="text-lg font-bold">회원가입</div>
        <div className="text-[13px] text-muted-foreground">검사관 계정을 신청합니다</div>
      </div>

      <Label label="아이디" htmlFor="signup-id">
        <Input
          id="signup-id"
          value={id}
          onChange={(e) => {
            setId(e.target.value)
            setError(null)
          }}
          placeholder="사용할 아이디"
          autoComplete="username"
          className="h-10 rounded-[10px]"
        />
      </Label>

      <Label label="이름" htmlFor="signup-name">
        <Input
          id="signup-name"
          value={name}
          onChange={(e) => {
            setName(e.target.value)
            setError(null)
          }}
          placeholder="홍길동"
          autoComplete="name"
          className="h-10 rounded-[10px]"
        />
      </Label>

      <div className="grid grid-cols-2 gap-3">
        <Label label="비밀번호" htmlFor="signup-pw">
          <Input
            id="signup-pw"
            type="password"
            value={password}
            onChange={(e) => {
              setPassword(e.target.value)
              setError(null)
            }}
            placeholder="••••••••"
            autoComplete="new-password"
            className="h-10 rounded-[10px]"
          />
        </Label>
        <Label label="비밀번호 확인" htmlFor="signup-pw2">
          <Input
            id="signup-pw2"
            type="password"
            value={confirm}
            onChange={(e) => {
              setConfirm(e.target.value)
              setError(null)
            }}
            placeholder="••••••••"
            autoComplete="new-password"
            className="h-10 rounded-[10px]"
          />
        </Label>
      </div>

      {error && (
        <div className="flex items-center gap-1.5 text-xs font-semibold text-cj-red">
          <TriangleAlert className="size-3.5" />
          {error}
        </div>
      )}

      <Button type="submit" className="h-10.5 rounded-[10px] bg-cj-blue font-semibold text-white hover:bg-cj-blue/90">
        가입 신청
      </Button>
    </form>
  )
}
