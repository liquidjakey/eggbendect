import { useState } from 'react'
import { Card } from '@/components/ui/card'
import { BrandMark, BrandWordmark } from '@/components/BrandMark'
import { LoginForm } from './LoginForm'
import { SignUpForm } from './SignUpForm'
import { ForgotPasswordForm } from './ForgotPasswordForm'

type LoginView = 'login' | 'signup' | 'forgot'

interface LoginProps {
  onLogin: () => void
}

export function Login({ onLogin }: LoginProps) {
  const [view, setView] = useState<LoginView>('login')

  return (
    <div className="flex h-screen w-full items-center justify-center bg-secondary/50 p-5">
      <div className="w-full max-w-100">
        <div className="mb-6 flex flex-col items-center gap-2.5">
          <BrandMark className="size-11" />
          <div className="text-center">
            <BrandWordmark textClassName="text-xl" />
            <div className="text-[13px] text-muted-foreground">AI 기반 계란 품질검사</div>
          </div>
        </div>

        <Card className="p-6.5 shadow-sm">
          {view === 'login' && (
            <LoginForm onLogin={onLogin} onSignUp={() => setView('signup')} onForgotPassword={() => setView('forgot')} />
          )}
          {view === 'signup' && <SignUpForm onBack={() => setView('login')} />}
          {view === 'forgot' && <ForgotPasswordForm onBack={() => setView('login')} />}
        </Card>

        <div className="mt-5 text-center text-[11px] text-muted-foreground">© 2026 Eggbenedet · 품질 검사 대시보드</div>
      </div>
    </div>
  )
}
