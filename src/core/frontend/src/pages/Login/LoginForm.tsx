import { useState, type FormEvent } from 'react'
import { Lock, TriangleAlert, User } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from './Field'
import { ApiError, login, setToken } from '@/lib/api'

interface LoginFormProps {
  onLogin: () => void
  onSignUp: () => void
  onForgotPassword: () => void
}

export function LoginForm({ onLogin, onSignUp, onForgotPassword }: LoginFormProps) {
  const [id, setId] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!id.trim() || !password.trim()) {
      setError('아이디와 비밀번호를 입력해 주세요')
      return
    }
    setSubmitting(true)
    try {
      const res = await login(id.trim(), password)
      setToken(res.accessToken)
      onLogin()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '로그인에 실패했습니다')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <div>
        <div className="text-lg font-bold">로그인</div>
        <div className="text-[13px] text-muted-foreground">검사 시스템에 접속하려면 로그인하세요</div>
      </div>

      <Label label="아이디" htmlFor="login-id">
        <div className="relative">
          <User className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            id="login-id"
            value={id}
            onChange={(e) => {
              setId(e.target.value)
              setError(null)
            }}
            placeholder="admin"
            autoComplete="username"
            autoFocus
            className="h-10 rounded-[10px] pl-9"
          />
        </div>
      </Label>

      <Label label="비밀번호" htmlFor="login-pw">
        <div className="relative">
          <Lock className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            id="login-pw"
            type="password"
            value={password}
            onChange={(e) => {
              setPassword(e.target.value)
              setError(null)
            }}
            placeholder="••••••••"
            autoComplete="current-password"
            className="h-10 rounded-[10px] pl-9"
          />
        </div>
      </Label>

      {error && (
        <div className="flex items-center gap-1.5 text-xs font-semibold text-cj-red">
          <TriangleAlert className="size-3.5" />
          {error}
        </div>
      )}

      <Button type="submit" disabled={submitting} className="h-10.5 rounded-[10px] bg-cj-blue font-semibold text-white hover:bg-cj-blue/90">
        {submitting ? '로그인 중…' : '로그인'}
      </Button>

      <div className="flex items-center justify-center gap-3 text-xs text-muted-foreground">
        <button type="button" onClick={onSignUp} className="hover:text-foreground hover:underline">
          회원가입
        </button>
        <span className="text-border">|</span>
        <button type="button" onClick={onForgotPassword} className="hover:text-foreground hover:underline">
          비밀번호 찾기
        </button>
      </div>
    </form>
  )
}
